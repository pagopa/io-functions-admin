import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import * as t from "io-ts";

// Activity input
export const ActivityInput = t.interface({
  backupFolder: NonEmptyString,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity success result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

// Activity failed because of invalid input
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;

// Activity failed because of an error on a query
export const QueryFailure = t.intersection([
  t.interface({
    kind: t.literal("QUERY_FAILURE"),
    reason: t.string
  }),
  t.partial({ query: t.string })
]);
export type QueryFailure = t.TypeOf<typeof QueryFailure>;

// activity failed for user not found
export const UserNotFound = t.interface({
  kind: t.literal("USER_NOT_FOUND_FAILURE")
});
export type UserNotFound = t.TypeOf<typeof UserNotFound>;

// activity failed while deleting a document from the db
export const DocumentDeleteFailure = t.interface({
  kind: t.literal("DELETE_FAILURE"),
  reason: t.string
});
export type DocumentDeleteFailure = t.TypeOf<typeof DocumentDeleteFailure>;

// activity failed while creating a new blob on storage
export const BlobCreationFailure = t.interface({
  kind: t.literal("BLOB_FAILURE"),
  reason: t.string
});
export type BlobCreationFailure = t.TypeOf<typeof BlobCreationFailure>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  UserNotFound,
  QueryFailure,
  InvalidInputFailure,
  BlobCreationFailure,
  DocumentDeleteFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

// type alias for fetch, delete and backup of data
export type DataFailure =
  | BlobCreationFailure
  | DocumentDeleteFailure
  | QueryFailure;

// define a value object with the info related to the blob storage for backup files
export interface IBlobServiceInfo {
  readonly blobService: BlobService;
  readonly containerName: string;
  readonly folder?: NonEmptyString;
}
