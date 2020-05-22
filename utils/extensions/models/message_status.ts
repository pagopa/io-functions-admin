import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import {
  MESSAGE_STATUS_MODEL_ID_FIELD,
  MESSAGE_STATUS_MODEL_PK_FIELD,
  MessageStatusModel as MessageStatusModelBase,
  RetrievedMessageStatus
} from "io-functions-commons/dist/src/models/message_status";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../documentdb";

export class MessageStatusModel extends MessageStatusModelBase {
  public async deleteMessageStatusVersion(
    messageId: NonEmptyString,
    documentId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      documentId,
      messageId
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   * @param modelId
   */
  public findAllVersionsByModelId(
    modelId: NonEmptyString
  ): DocumentDbUtils.IResultIterator<RetrievedMessageStatus> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.dbClient,
      this.collectionUri,
      MESSAGE_STATUS_MODEL_ID_FIELD,
      modelId,
      MESSAGE_STATUS_MODEL_PK_FIELD,
      modelId
    );
  }
}
