import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import {
  NOTIFICATION_STATUS_MODEL_ID_FIELD,
  NOTIFICATION_STATUS_MODEL_PK_FIELD,
  NotificationStatusModel as NotificationStatusModelBase,
  RetrievedNotificationStatus
} from "io-functions-commons/dist/src/models/notification_status";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../utils/documentdb";

export class NotificationStatusModel extends NotificationStatusModelBase {
  public async deleteNotificationStatusVersion(
    notificationId: NonEmptyString,
    documentId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      documentId,
      notificationId
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   * @param modelId
   */
  public findAllVersionsByModelId(
    modelId: NonEmptyString
  ): DocumentDbUtils.IResultIterator<RetrievedNotificationStatus> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.dbClient,
      this.collectionUri,
      NOTIFICATION_STATUS_MODEL_ID_FIELD,
      modelId,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      modelId
    );
  }
}
