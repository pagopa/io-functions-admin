import { BlobService } from "azure-storage";
import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import { MessageModel as MessageModelBase } from "io-functions-commons/dist/src/models/message";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { deleteBlob } from "../azure_storage";
import * as DocumentDbUtils from "../documentdb";

// duplicated from base calss module, as it is not exposed
const MESSAGE_BLOB_STORAGE_SUFFIX = ".json";
// duplicated from base calss module, as it is not exposed
function blobIdFromMessageId(messageId: string): string {
  return `${messageId}${MESSAGE_BLOB_STORAGE_SUFFIX}`;
}
export class MessageModel extends MessageModelBase {
  public async deleteMessage(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      messageId,
      fiscalCode
    );
  }

  public async deleteContentFromBlob(
    blobService: BlobService,
    messageId: string
  ): Promise<Either<Error, true>> {
    return deleteBlob(
      blobService,
      this.containerName,
      blobIdFromMessageId(messageId)
    );
  }
}
