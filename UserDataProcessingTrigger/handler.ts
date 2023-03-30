import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import { Lazy, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { TableUtilities } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  ABORT_EVENT as ABORT_DELETE_EVENT,
  makeOrchestratorId as makeDeleteOrchestratorId
} from "../UserDataDeleteOrchestratorV2/utils";
import {
  trackUserDataDeleteEvent,
  trackUserDataDownloadEvent
} from "../utils/appinsightsEvents";
import { flags } from "../utils/featureFlags";
import { isOrchestratorRunning } from "../utils/orchestrator";
import { DeleteTableEntity, InsertTableEntity } from "../utils/storage";
import { Connection, WorkflowClient } from "@temporalio/client";
import { userDataDownloadWorkflow } from "../UserDataDownloadWorkflow";
import {
  ClosedUserDataProcessing,
  CosmosDbDocumentCollection,
  FailedUserDataProcessing,
  ProcessableUserDataDelete,
  ProcessableUserDataDeleteAbort,
  ProcessableUserDataDownload
} from "../utils/user_data_types";

const eg = TableUtilities.entityGenerator;

const logPrefix = "UserDataProcessingHandler";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName:
    | "UserDataDownloadOrchestrator"
    | "UserDataDeleteOrchestratorV2",
  orchestratorId: string,
  orchestratorInput: unknown
): Promise<string> =>
  pipe(
    isOrchestratorRunning(dfClient, orchestratorId),
    TE.chain(_ =>
      !_.isRunning
        ? TE.tryCatch(
            () =>
              dfClient.startNew(
                orchestratorName,
                orchestratorId,
                orchestratorInput
              ),
            E.toError
          )
        : // if the orchestrator is already running, just return the id
          TE.of(orchestratorId)
    ),

    // if something wrong, just raise the error
    TE.mapLeft(error => {
      throw error;
    }),
    TE.toUnion
  )();

const startUserDataDeleteOrchestrator = (
  context: Context,
  processable: ProcessableUserDataDelete
): Promise<string> => {
  const dfClient = df.getClient(context);
  context.log.info(
    `${logPrefix}: starting UserDataDeleteOrchestrator with ${processable.fiscalCode}`
  );
  trackUserDataDeleteEvent("started", processable);
  const orchestratorId = makeDeleteOrchestratorId(processable.fiscalCode);
  return startOrchestrator(
    dfClient,
    "UserDataDeleteOrchestratorV2",
    orchestratorId,
    processable
  );
};

const raiseAbortEventOnOrchestrator = (
  context: Context,
  processable: ProcessableUserDataDeleteAbort
): Promise<void> => {
  const dfClient = df.getClient(context);
  context.log.info(
    `${logPrefix}: aborting UserDataDeleteOrchestrator with ${processable.fiscalCode}`
  );
  trackUserDataDeleteEvent("abort_requested", processable);
  const orchestratorId = makeDeleteOrchestratorId(processable.fiscalCode);
  return dfClient.raiseEvent(orchestratorId, ABORT_DELETE_EVENT, {});
};

const processFailedUserDataProcessing = async (
  context: Context,
  processable: FailedUserDataProcessing,
  insertEntityFn: InsertTableEntity
): Promise<void> => {
  // If a failed user_data_processing has been inserted
  // we insert a record into failed_user_data_processing table storage
  context.log.verbose(
    `${logPrefix}|KEY=${processable.fiscalCode}|Inserting a failed_user_data_processing record`
  );
  const { e1: resultOrError, e2: sResponse } = await insertEntityFn({
    PartitionKey: eg.String(processable.choice),
    Reason: eg.String(processable.reason),
    RowKey: eg.String(processable.fiscalCode)
  });
  if (E.isLeft(resultOrError) && sResponse.statusCode !== 409) {
    context.log.error(`${logPrefix}|ERROR=${resultOrError.left.message}`);
  }
};

const processClosedUserDataProcessing = async (
  context: Context,
  processable: ClosedUserDataProcessing,
  deleteEntityFn: DeleteTableEntity
): Promise<void> => {
  // If a completed user_data_processing has been inserted
  // we delete any record from FailedUserDataProcessing table storage
  context.log.verbose(
    `${logPrefix}|KEY=${processable.fiscalCode}|Deleting any failed_user_data_processing record`
  );
  const { e1: maybeError, e2: uResponse } = await deleteEntityFn({
    PartitionKey: eg.String(processable.choice),
    RowKey: eg.String(processable.fiscalCode)
  });
  if (O.isSome(maybeError) && uResponse.statusCode !== 404) {
    context.log.error(
      `${logPrefix}|processClosedUserDataProcessing|ERROR=${maybeError.value.message}`
    );
  }
};

type Processable = t.TypeOf<typeof Processable>;
const Processable = t.union([
  ProcessableUserDataDownload,
  ProcessableUserDataDelete,
  ProcessableUserDataDeleteAbort,
  FailedUserDataProcessing,
  ClosedUserDataProcessing
]);

const startUserDataDownloadWorkflow = async (
  context: Context,
  processable: Processable
) => {
  const connectionOptions = {
    address: "host.docker.internal:7233"
  };

  console.log("starting workflow");

  const connection = await Connection.connect(connectionOptions);

  const client = new WorkflowClient({
    connection
  });

  const handle = await client.start(userDataDownloadWorkflow, {
    args: [processable, context],
    taskQueue: "userDataDownloadQueue",
    workflowId: "DOWNLOAD-" + processable.fiscalCode
  });

  console.log("started workflow");

  const result = await handle.result();

  console.log(result);
  console.log("workflow finished");
};

const getAction = (
  context: Context,
  insertFailure: InsertTableEntity,
  removeFailure: DeleteTableEntity
  // eslint-disable-next-line sonarjs/cognitive-complexity
) => (processable: Processable): Lazy<Promise<string | void>> =>
  flags.ENABLE_USER_DATA_DOWNLOAD && ProcessableUserDataDownload.is(processable)
    ? (): Promise<void> => startUserDataDownloadWorkflow(context, processable)
    : flags.ENABLE_USER_DATA_DELETE && ProcessableUserDataDelete.is(processable)
    ? (): Promise<string> =>
        startUserDataDeleteOrchestrator(context, processable)
    : ProcessableUserDataDeleteAbort.is(processable)
    ? (): Promise<void> => raiseAbortEventOnOrchestrator(context, processable)
    : FailedUserDataProcessing.is(processable)
    ? (): Promise<void> =>
        processFailedUserDataProcessing(context, processable, insertFailure)
    : ClosedUserDataProcessing.is(processable)
    ? (): Promise<void> =>
        processClosedUserDataProcessing(context, processable, removeFailure)
    : // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
      () => void 0;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, sonarjs/cognitive-complexity
export const triggerHandler = (
  insertFailure: InsertTableEntity,
  removeFailure: DeleteTableEntity
) => (
  context: Context,
  input: unknown // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<ReadonlyArray<string | void>> => {
  const operations = pipe(
    input,
    CosmosDbDocumentCollection.decode,
    E.fold(
      err => {
        throw Error(
          `${logPrefix}: cannot decode input [${readableReport(err)}]`
        );
      },
      docs =>
        docs.reduce(
          (lazyOperations, processableOrNot) =>
            pipe(
              processableOrNot,
              Processable.decode,
              E.map(getAction(context, insertFailure, removeFailure)),
              E.fold(
                _ => {
                  context.log.warn(
                    `${logPrefix}: skipping document [${JSON.stringify(
                      processableOrNot
                    )}]`
                  );
                  return lazyOperations;
                },
                lazyOp => [...lazyOperations, lazyOp]
              )
            ),
          [] as ReadonlyArray<Lazy<Promise<string | void>>>
        )
    )
  );

  context.log.info(
    `${logPrefix}: processing ${operations.length} document${
      operations.length === 1 ? "" : "s"
    }`
  );

  return Promise.all(operations.map(op => op()));
};
