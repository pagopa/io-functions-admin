import * as t from "io-ts";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";

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

export const CosmosDbDocumentCollection = t.readonlyArray(
  t.readonly(t.UnknownRecord)
);
export type CosmosDbDocumentCollection = t.TypeOf<
  typeof CosmosDbDocumentCollection
>;
