/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import { NotificationModel as NotificationModelBase } from "io-functions-commons/dist/src/models/notification";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../utils/documentdb";

export class NotificationModel extends NotificationModelBase {
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
