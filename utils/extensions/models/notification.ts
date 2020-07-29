/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import { Either } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import {
  NotificationModel as NotificationModelBase,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

/**
 * Extends NotificationModel with deleting operations
 */
export class NotificationDeletableModel extends NotificationModelBase {
  /**
   * Returns the notifications for the provided message id
   *
   * @param messageId The message the notifications refer to
   */
  public findNotificationsForMessage(
    messageId: string
  ): AsyncIterator<ReadonlyArray<Either<Errors, RetrievedNotification>>> {
    return this.getQueryIterator({
      parameters: [
        {
          name: "@messageId",
          value: messageId
        }
      ],
      query: `SELECT * FROM m WHERE m.messageId = @messageId`
    })[Symbol.asyncIterator]();
  }

  /**
   * Deletes a single notification
   * @param messageId message identifier of the notification (is partition key)
   * @param notificationId notification identifier
   */
  public deleteNotification(
    messageId: NonEmptyString,
    notificationId: NonEmptyString
  ): TaskEither<CosmosErrors, string> {
    return tryCatch(
      () => this.container.item(notificationId, messageId).delete(),
      toCosmosErrorResponse
    ).map(_ => _.item.id);
  }
}
