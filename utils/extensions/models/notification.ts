/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import {
  NotificationModel as NotificationModelBase,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../documentdb";

/**
 * Extends NotificationModel with deleting operations
 */
export class NotificationDeletableModel extends NotificationModelBase {
  /**
   * Creates a new Notification model
   *
   * @param dbClient the DocumentDB client
   * @param collectionUrl the collection URL
   */
  constructor(
    dbClient: DocumentDb.DocumentClient,
    collectionUrl: DocumentDbUtils.IDocumentDbCollectionUri
  ) {
    super(dbClient, collectionUrl);
  }

  /**
   * Returns the notifications for the provided message id
   *
   * @param messageId The message the notifications refer to
   */
  public findNotificationsForMessage(
    messageId: string
  ): DocumentDbUtils.IResultIterator<RetrievedNotification> {
    return DocumentDbUtils.queryDocuments(
      this.dbClient,
      this.collectionUri,
      {
        parameters: [
          {
            name: "@messageId",
            value: messageId
          }
        ],
        query: `SELECT * FROM m WHERE m.messageId = @messageId`
      },
      messageId
    );
  }

  /**
   * Deletes a single notification
   * @param messageId message identifier of the notification (is partition key)
   * @param notificationId notification identifier
   */
  public async deleteNotification(
    messageId: NonEmptyString,
    notificationId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      notificationId,
      messageId
    );
  }
}
