import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import { fromNullable } from "fp-ts/lib/Either";
import { Lazy } from "fp-ts/lib/function";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
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

const logPrefix = "UserDataProcessingTrigger";

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

const CosmosDbDocumentCollection = t.readonlyArray(t.readonly(t.UnknownRecord));
type CosmosDbDocumentCollection = t.TypeOf<typeof CosmosDbDocumentCollection>;

const startOrchestrator = async (
  dfClient: DurableOrchestrationClient,
  orchestratorName:
    | "UserDataDownloadOrchestrator"
    | "UserDataDeleteOrchestrator",
  orchestratorId: string,
  orchestratorInput: unknown
) => {
  const existingInstance = await dfClient.getStatus(orchestratorId);
  return !existingInstance
    ? dfClient.startNew(orchestratorName, orchestratorId, orchestratorInput)
    : null;
};

export function index(
  context: Context,
  input: unknown
): Promise<ReadonlyArray<string | void>> {
  const dfClient = df.getClient(context);
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
            ProcessableUserDataDeleteAbort
          ])
          .decode(processableOrNot)
          .chain(processable =>
            fromNullable(undefined)(
              flags.ENABLE_USER_DATA_DOWNLOAD &&
                ProcessableUserDataDownload.is(processable)
                ? () => {
                    context.log.info(
                      `${logPrefix}: starting UserDataDownloadOrchestrator with ${processable.fiscalCode}`
                    );
                    trackUserDataDownloadEvent("started", processable);
                    const orchestratorId = makeDownloadOrchestratorId(
                      processable.fiscalCode
                    );
                    return startOrchestrator(
                      dfClient,
                      "UserDataDownloadOrchestrator",
                      orchestratorId,
                      processable
                    );
                  }
                : flags.ENABLE_USER_DATA_DELETE &&
                  ProcessableUserDataDelete.is(processable)
                ? () => {
                    context.log.info(
                      `${logPrefix}: starting UserDataDeleteOrchestrator with ${processable.fiscalCode}`
                    );
                    trackUserDataDeleteEvent("started", processable);
                    const orchestratorId = makeDeleteOrchestratorId(
                      processable.fiscalCode
                    );
                    return startOrchestrator(
                      dfClient,
                      "UserDataDeleteOrchestrator",
                      orchestratorId,
                      processable
                    );
                  }
                : ProcessableUserDataDeleteAbort.is(processable)
                ? () => {
                    context.log.info(
                      `${logPrefix}: aborting UserDataDeleteOrchestrator with ${processable.fiscalCode}`
                    );
                    trackUserDataDeleteEvent("abort_requested", processable);
                    const orchestratorId = makeDeleteOrchestratorId(
                      processable.fiscalCode
                    );
                    return dfClient.raiseEvent(
                      orchestratorId,
                      ABORT_DELETE_EVENT,
                      {}
                    );
                  }
                : undefined
            )
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
}
