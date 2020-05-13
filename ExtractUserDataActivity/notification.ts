/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import * as DocumentDb from "documentdb";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import {
  NotificationBase,
  NotificationChannelEmail,
  NotificationModel as NotificationModelCommons,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import * as DocumentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import * as t from "io-ts";

// like Notification, but it's export-safe (the decoder removes webhook's sensitive data)
export const SafeNotification = t.intersection([
  NotificationBase,
  t.interface({
    channels: t.exact(
      t.partial({
        [NotificationChannelEnum.EMAIL]: NotificationChannelEmail,
        [NotificationChannelEnum.WEBHOOK]: t.exact(t.interface({}))
      })
    )
  })
]);
export type SafeNotification = t.TypeOf<typeof SafeNotification>;

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
}
