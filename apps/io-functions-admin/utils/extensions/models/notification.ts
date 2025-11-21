/**
 * An extensions of io-functions-commons/dist/src/models/notification to implement missing query methods
 * Ideally they will be integrated in the common module
 */

import * as TE from "fp-ts/lib/TaskEither";
import { NotificationModel as NotificationModelBase } from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";

/**
 * Extends NotificationModel with deleting operations
 */
export class NotificationDeletableModel extends NotificationModelBase {
  /**
   * Deletes a single notification
   *
   * @param messageId message identifier of the notification (is partition key)
   * @param notificationId notification identifier
   */
  public deleteNotification(
    messageId: NonEmptyString,
    notificationId: NonEmptyString
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(notificationId, messageId).delete(),
        toCosmosErrorResponse
      ),
      TE.map(_ => _.item.id)
    );
  }
}
