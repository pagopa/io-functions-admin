import * as TE from "fp-ts/lib/TaskEither";
import {
  MESSAGE_STATUS_MODEL_ID_FIELD,
  MESSAGE_STATUS_MODEL_PK_FIELD,
  MessageStatusModel as MessageStatusModelBase,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import * as t from "io-ts";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as DocumentDbUtils from "../documentdb";

/**
 * Extends MessageStatusModel with deleting operations
 */
export class MessageStatusDeletableModel extends MessageStatusModelBase {
  public deleteMessageStatusVersion(
    messageId: NonEmptyString,
    documentId: NonEmptyString
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(documentId, messageId).delete(),
        toCosmosErrorResponse
      ),
      TE.map(_ => _.item.id)
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   *
   * @param modelId
   */
  public findAllVersionsByModelId(
    modelId: NonEmptyString
  ): AsyncIterator<ReadonlyArray<t.Validation<RetrievedMessageStatus>>> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.container,
      this.retrievedItemT,
      MESSAGE_STATUS_MODEL_ID_FIELD,
      modelId,
      MESSAGE_STATUS_MODEL_PK_FIELD,
      modelId
    )[Symbol.asyncIterator]();
  }
}
