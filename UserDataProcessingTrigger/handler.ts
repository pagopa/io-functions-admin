import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import { Lazy } from "fp-ts/lib/function";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { TableUtilities } from "azure-storage";
import {
  ABORT_EVENT as ABORT_DELETE_EVENT,
  makeOrchestratorId as makeDeleteOrchestratorId
} from "../UserDataDeleteOrchestrator/utils";
import { makeOrchestratorId as makeDownloadOrchestratorId } from "../UserDataDownloadOrchestrator/utils";
import {
  trackUserDataDeleteEvent,
  trackUserDataDownloadEvent
} from "../utils/appinsightsEvents";
import { flags } from "../utils/featureFlags";
import { isOrchestratorRunning } from "../utils/orchestrator";
import { DeleteTableEntity } from "../utils/storage";

const eg = TableUtilities.entityGenerator;

// configure log prefix
const logPrefix = "UserDataProcessingHandler";

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ProcessableUserDataDownload = t.TypeOf<
  typeof ProcessableUserDataDownload
>;
export const ProcessableUserDataDownload = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    choice: t.literal(UserDataProcessingChoiceEnum.DOWNLOAD),
    status: t.literal(UserDataProcessingStatusEnum.PENDING)
  })
]);

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ProcessableUserDataDelete = t.TypeOf<
  typeof ProcessableUserDataDelete
>;
export const ProcessableUserDataDelete = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    choice: t.literal(UserDataProcessingChoiceEnum.DELETE),
    status: t.literal(UserDataProcessingStatusEnum.PENDING)
  })
]);

// models the subset of UserDataProcessing documents that are delete abort requests
export type ProcessableUserDataDeleteAbort = t.TypeOf<
  typeof ProcessableUserDataDeleteAbort
>;
export const ProcessableUserDataDeleteAbort = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    choice: t.literal(UserDataProcessingChoiceEnum.DELETE),
    status: t.literal(UserDataProcessingStatusEnum.ABORTED)
  })
]);

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type FailedUserDataProcessing = t.TypeOf<
  typeof FailedUserDataProcessing
>;
export const FailedUserDataProcessing = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    status: t.literal(UserDataProcessingStatusEnum.FAILED)
  })
]);

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ClosedUserDataProcessing = t.TypeOf<
  typeof ClosedUserDataProcessing
>;
export const ClosedUserDataProcessing = t.intersection([
  UserDataProcessing,
  // ony the subset of UserDataProcessing documents
  // with the following characteristics must be processed
  t.interface({
    status: t.literal(UserDataProcessingStatusEnum.CLOSED)
  })
]);

const CosmosDbDocumentCollection = t.readonlyArray(t.readonly(t.UnknownRecord));
type CosmosDbDocumentCollection = t.TypeOf<typeof CosmosDbDocumentCollection>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName:
    | "UserDataDownloadOrchestrator"
    | "UserDataDeleteOrchestrator",
  orchestratorId: string,
  orchestratorInput: unknown
) =>
  isOrchestratorRunning(dfClient, orchestratorId)
    .fold(
      error => {
        throw error;
      },
      _ =>
        !_.isRunning
          ? dfClient.startNew(
              orchestratorName,
              orchestratorId,
              orchestratorInput
            )
          : null
    )
    .run();

const startUserDataDownloadOrchestrator = (
  context: Context,
  processable: ProcessableUserDataDownload
): Promise<string> => {
  const dfClient = df.getClient(context);
  context.log.info(
    `${logPrefix}: starting UserDataDownloadOrchestrator with ${processable.fiscalCode}`
  );
  trackUserDataDownloadEvent("started", processable);
  const orchestratorId = makeDownloadOrchestratorId(processable.fiscalCode);
  return startOrchestrator(
    dfClient,
    "UserDataDownloadOrchestrator",
    orchestratorId,
    processable
  );
};

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
    "UserDataDeleteOrchestrator",
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
  processable: FailedUserDataProcessing
): Promise<void> => {
  // If a failed user_data_processing has been inserted
  // we insert a record into FailedUserDataProcessing table storage
  context.log.verbose(
    `${logPrefix}|KEY=${processable.fiscalCode}|Inserting failed_user_data_processing entity`
  );
  // eslint-disable-next-line functional/immutable-data
  context.bindings.FailedUserDataProcessingOut = [
    {
      PartitionKey: processable.choice,
      Reason: processable.reason,
      RowKey: processable.fiscalCode
    }
  ];
};

const processClosedUserDataProcessing = async (
  context: Context,
  processable: ClosedUserDataProcessing,
  deleteEntityFn: DeleteTableEntity
): Promise<void> => {
  // If a completed user_data_processing has been inserted
  // we delete any record from FailedUserDataProcessing table storage
  context.log.verbose(
    `${logPrefix}|KEY=${processable.fiscalCode}|Deleting any failed_user_data_processing entity`
  );
  const { e1: maybeError, e2: uResponse } = await deleteEntityFn({
    PartitionKey: eg.String(processable.choice),
    RowKey: eg.String(processable.fiscalCode)
  });
  if (maybeError.isSome() && uResponse.statusCode !== 404) {
    context.log.error(
      `${logPrefix}|processClosedUserDataProcessing|ERROR=${maybeError.value.message}`
    );
  }
};

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, sonarjs/cognitive-complexity
export const triggerHandler = (removeFailure: DeleteTableEntity) => (
  context: Context,
  input: unknown // eslint-disable-next-line sonarjs/cognitive-complexity
): Promise<ReadonlyArray<string | void>> => {
  const operations = CosmosDbDocumentCollection.decode(input)
    .getOrElseL(err => {
      throw Error(`${logPrefix}: cannot decode input [${readableReport(err)}]`);
    })
    .reduce(
      (lazyOperations, processableOrNot) =>
        t
          .union([
            ProcessableUserDataDownload,
            ProcessableUserDataDelete,
            ProcessableUserDataDeleteAbort,
            FailedUserDataProcessing,
            ClosedUserDataProcessing
          ])
          .decode(processableOrNot)
          .map(processable =>
            flags.ENABLE_USER_DATA_DOWNLOAD &&
            ProcessableUserDataDownload.is(processable)
              ? (): Promise<string> =>
                  startUserDataDownloadOrchestrator(context, processable)
              : flags.ENABLE_USER_DATA_DELETE &&
                ProcessableUserDataDelete.is(processable)
              ? (): Promise<string> =>
                  startUserDataDeleteOrchestrator(context, processable)
              : ProcessableUserDataDeleteAbort.is(processable)
              ? (): Promise<void> =>
                  raiseAbortEventOnOrchestrator(context, processable)
              : FailedUserDataProcessing.is(processable)
              ? (): Promise<void> =>
                  processFailedUserDataProcessing(context, processable)
              : ClosedUserDataProcessing.is(processable)
              ? (): Promise<void> =>
                  processClosedUserDataProcessing(
                    context,
                    processable,
                    removeFailure
                  )
              : // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                () => void 0
          )
          .fold(
            _ => {
              context.log.warn(
                `${logPrefix}: skipping document [${JSON.stringify(
                  processableOrNot
                )}]`
              );
              return lazyOperations;
            },
            lazyOp => [...lazyOperations, lazyOp]
          ),
      [] as ReadonlyArray<Lazy<Promise<string | void>>>
    );

  context.log.info(
    `${logPrefix}: processing ${operations.length} document${
      operations.length === 1 ? "" : "s"
    }`
  );

  return Promise.all(operations.map(op => op()));
};
