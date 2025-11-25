import {
  NOTIFICATION_STATUS_MODEL_PK_FIELD,
  NotificationStatusModel as NotificationStatusModelBase,
  RetrievedNotificationStatus
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { Either } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { Errors } from "io-ts";

import * as DocumentDbUtils from "../documentdb";

/**
 * Extends NotificationStatusModel with deleting operations
 */
export class NotificationStatusDeletableModel extends NotificationStatusModelBase {
  public deleteNotificationStatusVersion(
    notificationId: NonEmptyString,
    documentId: NonEmptyString
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(documentId, notificationId).delete(),
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
  public findAllVersionsByNotificationId(
    notificationId: NonEmptyString
  ): AsyncIterator<readonly Either<Errors, RetrievedNotificationStatus>[]> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.container,
      this.retrievedItemT,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      notificationId,
      NOTIFICATION_STATUS_MODEL_PK_FIELD,
      notificationId
    )[Symbol.asyncIterator]();
  }
}
