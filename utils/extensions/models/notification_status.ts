import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import {
  NOTIFICATION_STATUS_MODEL_ID_FIELD,
  NOTIFICATION_STATUS_MODEL_PK_FIELD,
  NotificationStatusModel as NotificationStatusModelBase,
  RetrievedNotificationStatus
} from "io-functions-commons/dist/src/models/notification_status";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../documentdb";

/**
 * Extends NotificationStatusModel with deleting operations
 */
export class NotificationStatusDeletableModel extends NotificationStatusModelBase {
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
    notificationId: NonEmptyString,
    modelId: NonEmptyString
  ): DocumentDbUtils.IResultIterator<RetrievedNotificationStatus> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.dbClient,
      this.collectionUri,
      NOTIFICATION_STATUS_MODEL_ID_FIELD,
      modelId,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      notificationId
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   * @param modelId
   */
  public findAllVersionsByNotificationId(
    notificationId: NonEmptyString
  ): DocumentDbUtils.IResultIterator<RetrievedNotificationStatus> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.dbClient,
      this.collectionUri,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      notificationId,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      notificationId
    );
  }
}
