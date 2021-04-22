import { MessageModel as MessageModelBase } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { BlobService } from "azure-storage";
import { toError } from "fp-ts/lib/Either";
import { fromEither, TaskEither } from "fp-ts/lib/TaskEither";
import { tryCatch } from "fp-ts/lib/TaskEither";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { deleteBlob } from "../azure_storage";

// duplicated from base calss module, as it is not exposed
const MESSAGE_BLOB_STORAGE_SUFFIX = ".json";
// duplicated from base calss module, as it is not exposed
function blobIdFromMessageId(messageId: string): string {
  return `${messageId}${MESSAGE_BLOB_STORAGE_SUFFIX}`;
}
/**
 * Extends MessageModel with deleting operations
 */
export class MessageDeletableModel extends MessageModelBase {
  public deleteMessage(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): TaskEither<CosmosErrors, string> {
    return tryCatch(
      () => this.container.item(messageId, fiscalCode).delete(),
      toCosmosErrorResponse
    ).map(_ => _.item.id);
  }

  public deleteContentFromBlob(
    blobService: BlobService,
    messageId: string
  ): TaskEither<Error, true> {
    return tryCatch(
      () =>
        deleteBlob(
          blobService,
          this.containerName,
          blobIdFromMessageId(messageId)
        ),
      toError
    ).chain(fromEither);
  }
}
