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
import { createTableService, TableUtilities } from "azure-storage";
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

import { getConfigOrThrow } from "../utils/config";
import { deleteTableEntity, insertTableEntity } from "../utils/storage";

// prepare table storage utils
const config = getConfigOrThrow();

const storageConnectionString =
  config.FailedUserDataProcessingStorageConnection;
const tableService = createTableService(storageConnectionString);

const subscriptionsFeedTable = config.FAILED_USER_DATA_PROCESSING_TABLE;

const insertEntity = insertTableEntity(tableService, subscriptionsFeedTable);
const deleteEntity = deleteTableEntity(tableService, subscriptionsFeedTable);

const eg = TableUtilities.entityGenerator;

// configure log prefix
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
export type CompletedUserDataProcessing = t.TypeOf<
  typeof CompletedUserDataProcessing
>;
export const CompletedUserDataProcessing = t.intersection([
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, sonarjs/cognitive-complexity
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
            ProcessableUserDataDeleteAbort,
            FailedUserDataProcessing,
            CompletedUserDataProcessing
          ])
          .decode(processableOrNot)
          .chain(processable =>
            fromNullable(undefined)(
              flags.ENABLE_USER_DATA_DOWNLOAD &&
                ProcessableUserDataDownload.is(processable)
                ? // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                  () => {
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
                ? // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                  () => {
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
                ? // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                  () => {
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
                : FailedUserDataProcessing.is(processable)
                ? // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                  async (): Promise<void> => {
                    // If a failed user_data_processing has been inserted
                    // we insert a record into failed_user_data_processing table storage
                    context.log.verbose(
                      `${logPrefix}|KEY=${processable.fiscalCode}|Inserting failed_user_data_processing entity`
                    );
                    const {
                      e1: resultOrError,
                      e2: sResponse
                    } = await insertEntity({
                      PartitionKey: eg.String(processable.choice),
                      RowKey: eg.String(processable.fiscalCode)
                    });
                    if (
                      resultOrError.isLeft() &&
                      sResponse.statusCode !== 409
                    ) {
                      // retry
                      context.log.error(
                        `${logPrefix}|ERROR=${resultOrError.value.message}`
                      );
                    }
                  }
                : CompletedUserDataProcessing.is(processable)
                ? async (): Promise<void> => {
                    // If a completed user_data_processing has been inserted
                    // we delete any record into failed_user_data_processing table storage
                    context.log.verbose(
                      `${logPrefix}|KEY=${processable.fiscalCode}|Deleting any failed_user_data_processing entity`
                    );
                    const {
                      e1: maybeError,
                      e2: uResponse
                    } = await deleteEntity({
                      PartitionKey: eg.String(processable.choice),
                      RowKey: eg.String(processable.fiscalCode)
                    });
                    if (maybeError.isSome() && uResponse.statusCode !== 404) {
                      // retry
                      context.log.error(
                        `${logPrefix}|ERROR=${maybeError.value.message}`
                      );
                    }
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
