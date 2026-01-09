import { MessageModel as MessageModelBase } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { deleteBlob } from "../azure_storage";

// duplicated from base calss module, as it is not exposed
const MESSAGE_BLOB_STORAGE_SUFFIX = ".json";
// duplicated from base calss module, as it is not exposed

/**
 * Extends MessageModel with deleting operations
 */
export class MessageDeletableModel extends MessageModelBase {
  public deleteContentFromBlob(
    blobService: BlobService,
    messageId: string
  ): TE.TaskEither<Error, true> {
    return pipe(
      TE.tryCatch(
        () =>
          deleteBlob(
            blobService,
            this.containerName,
            blobIdFromMessageId(messageId)
          ),
        toError
      ),
      TE.chain(TE.fromEither)
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
