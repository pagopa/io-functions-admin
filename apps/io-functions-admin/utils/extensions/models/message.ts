import { BlobServiceClient } from "@azure/storage-blob";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/v2/MessageContent";
import { MessageModel as MessageModelBase } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import {
  deleteBlobIfExists,
  downloadBlobAsJson,
  getBlobClient,
  isBlobNotFoundError
} from "../../blob_storage";

// duplicated from base calss module, as it is not exposed
const MESSAGE_BLOB_STORAGE_SUFFIX = ".json";
// duplicated from base calss module, as it is not exposed

/**
 * Reads message content through the app's RBAC-authenticated Blob client.
 */
export class MessageContentReaderModel extends MessageModelBase {
  /**
   * The base model's getContentFromBlob still requires azure-storage's
   * BlobService, so this implementation uses the app's RBAC-authenticated
   * BlobServiceClient instead.
   */
  public getContentFromStorage(
    blobServiceClient: BlobServiceClient,
    messageId: string
  ): ReturnType<MessageModelBase["getContentFromBlob"]> {
    return pipe(
      TE.tryCatch(async () => {
        const content = await downloadBlobAsJson<unknown>(
          getBlobClient(
            blobServiceClient,
            this.containerName,
            blobIdFromMessageId(messageId)
          )
        );
        const decodedContent = MessageContent.decode(content);
        if (E.isLeft(decodedContent)) {
          throw new Error(readableReport(decodedContent.left));
        }
        return decodedContent.right;
      }, toError),
      TE.map(O.some),
      TE.orElse(error =>
        isBlobNotFoundError(error) ? TE.right(O.none) : TE.left(error)
      )
    );
  }
}

/**
 * Extends MessageContentReaderModel with deleting operations.
 */
export class MessageDeletableModel extends MessageContentReaderModel {
  public deleteContentFromStorage(
    blobServiceClient: BlobServiceClient,
    messageId: string
  ): TE.TaskEither<Error, true> {
    return TE.tryCatch(
      () =>
        deleteBlobIfExists(
          getBlobClient(
            blobServiceClient,
            this.containerName,
            blobIdFromMessageId(messageId)
          )
        ),
      toError
    );
  }

  public deleteMessage(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(messageId, fiscalCode).delete(),
        toCosmosErrorResponse
      ),
      TE.map(_ => _.item.id)
    );
  }
}
function blobIdFromMessageId(messageId: string): string {
  return `${messageId}${MESSAGE_BLOB_STORAGE_SUFFIX}`;
}
