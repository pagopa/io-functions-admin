/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import * as DocumentDb from "documentdb";
import {
  NotificationModel as NotificationModelCommons,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import * as DocumentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

export class NotificationModel extends NotificationModelCommons {
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
   * Returns the messages for the provided fiscal code
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
}
