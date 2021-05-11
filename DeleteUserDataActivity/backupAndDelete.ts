import { BlobService } from "azure-storage";
import { sequenceT } from "fp-ts/lib/Apply";
import { Either, fromOption, isLeft, toError } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";
import {
  fromEither,
  fromLeft,
  TaskEither,
  taskEither,
  taskEitherSeq,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { array, flatten, rights } from "fp-ts/lib/Array";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { RetrievedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/src/models/message";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { RetrievedNotification } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { RetrievedNotificationStatus } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { asyncIteratorToArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { DataFailure, IBlobServiceInfo, QueryFailure } from "./types";
import { saveDataToBlob } from "./utils";
import { toDocumentDeleteFailure, toQueryFailure } from "./utils";

/**
 * Recursively consumes an iterator and executes operations on every item
 *
 * @param deleteSingle takes an item and delete it
 * @param userDataBackup references about where to save data
 * @param makeBackupBlobName takes an item and construct a name for the backup blob
 * @param iterator an iterator of every result from the db
 */
const executeRecursiveBackupAndDelete = <T>(
  deleteSingle: (item: T) => TaskEither<CosmosErrors, string>,
  userDataBackup: IBlobServiceInfo,
  makeBackupBlobName: (item: T) => string,
  iterator: AsyncIterator<ReadonlyArray<Either<Errors, T>>>
): TaskEither<DataFailure, ReadonlyArray<T>> =>
  tryCatch(() => iterator.next(), toError)
    // this is just type lifting
    // eslint-disable-next-line functional/prefer-readonly-type
    .foldTaskEither<DataFailure, ReadonlyArray<T>>(
      e => fromLeft(toQueryFailure(e)),
      e =>
        e.done
          ? taskEither.of([])
          : e.value.some(isLeft)
          ? fromLeft(
              toQueryFailure(new Error("Some elements are not typed correctly"))
            )
          : taskEither.of(rights(e.value))
    )
    .chain(items =>
      // executes backup&delete for this set of items
      array
        .sequence(taskEither)(
          items.map((item: T) =>
            sequenceT(taskEitherSeq)<
              DataFailure,
              // eslint-disable-next-line functional/prefer-readonly-type
              [
                TaskEither<DataFailure, T>,
                TaskEither<DataFailure, string>,
                // eslint-disable-next-line functional/prefer-readonly-type
                TaskEither<DataFailure, ReadonlyArray<T>>
              ]
            >(
              saveDataToBlob<T>(userDataBackup, makeBackupBlobName(item), item),
              deleteSingle(item).mapLeft(toDocumentDeleteFailure),
              // recursive step
              executeRecursiveBackupAndDelete<T>(
                deleteSingle,
                userDataBackup,
                makeBackupBlobName,
                iterator
              )
            )
              // aggregates the results at the end of the recursion
              .map(([_, __, nextResults]) => [item, ...nextResults])
          )
        )
        .map(flatten)
    );

/**
 * Backup and delete every version of the profile
 *
 * @param param0.profileModel instance of ProfileModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.fiscalCode the identifier of the user
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const backupAndDeleteProfile = ({
  fiscalCode,
  profileModel,
  userDataBackup
}: {
  readonly profileModel: ProfileDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly fiscalCode: FiscalCode;
}) =>
  executeRecursiveBackupAndDelete<RetrievedProfile>(
    item => profileModel.deleteProfileVersion(item.fiscalCode, item.id),
    userDataBackup,
    item => `profile/${item.id}.json`,
    profileModel.findAllVersionsByModelId(fiscalCode)
  );

/**
 * Backup and delete a given notification
 *
 * @param param0.notificationModel instance of NotificationModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.notification the notification
 */
const backupAndDeleteNotification = ({
  notificationModel,
  userDataBackup,
  notification
}: {
  readonly notificationModel: NotificationDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly notification: RetrievedNotification;
}): TaskEither<DataFailure, RetrievedNotification> =>
  sequenceT(taskEitherSeq)<
    DataFailure,
    // eslint-disable-next-line functional/prefer-readonly-type
    [
      TaskEither<DataFailure, RetrievedNotification>,
      TaskEither<DataFailure, string>
    ]
  >(
    saveDataToBlob(
      userDataBackup,
      `notification/${notification.id}.json`,
      notification
    ),

    notificationModel
      .deleteNotification(notification.messageId, notification.id)
      .mapLeft(toDocumentDeleteFailure)
  ).map(_ => notification);

/**
 * Find all versions of a notification status, then backup and delete each document
 *
 * @param param0.notificationStatusModel instance of NotificationStatusModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.notification parent notification
 *
 */
const backupAndDeleteNotificationStatus = ({
  notificationStatusModel,
  userDataBackup,
  notification
}: {
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly notification: RetrievedNotification;
}): TaskEither<DataFailure, ReadonlyArray<RetrievedNotificationStatus>> =>
  executeRecursiveBackupAndDelete<RetrievedNotificationStatus>(
    item =>
      notificationStatusModel.deleteNotificationStatusVersion(
        item.notificationId,
        item.id
      ),
    userDataBackup,
    item => `notification-status/${item.id}.json`,
    notificationStatusModel.findAllVersionsByNotificationId(notification.id)
  );

/**
 * Backup and delete a given message
 *
 * @param param0.messageStatusModel instance of MessageStatusModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.message the message
 */
const backupAndDeleteMessage = ({
  messageModel,
  userDataBackup,
  message
}: {
  readonly messageModel: MessageDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly message: RetrievedMessageWithoutContent;
}): TaskEither<DataFailure, RetrievedMessageWithoutContent> =>
  sequenceT(taskEitherSeq)<
    DataFailure,
    // eslint-disable-next-line functional/prefer-readonly-type
    [
      TaskEither<DataFailure, RetrievedMessageWithoutContent>,
      TaskEither<DataFailure, string>
    ]
  >(
    saveDataToBlob<RetrievedMessageWithoutContent>(
      userDataBackup,
      `message/${message.id}.json`,
      message
    ),

    messageModel
      .deleteMessage(message.fiscalCode, message.id)
      .mapLeft(toDocumentDeleteFailure)
  ).map(_ => message);

const backupAndDeleteMessageContent = ({
  messageContentBlobService,
  messageModel,
  userDataBackup,
  message
}: {
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly message: RetrievedMessageWithoutContent;
}): TaskEither<DataFailure, Option<MessageContent>> =>
  messageModel
    .getContentFromBlob(messageContentBlobService, message.id)
    .chain(e => fromEither(fromOption(undefined)(e)))
    .foldTaskEither<DataFailure, Option<MessageContent>>(
      _ =>
        // unfortunately, a document not found is threated like a query error
        taskEither.of(none),
      content =>
        taskEither
          .of<DataFailure, void>(void 0)
          .chain(_ =>
            saveDataToBlob(
              userDataBackup,
              `message-content/${message.id}.json`,
              content
            )
          )
          .chain(_ =>
            messageModel
              .deleteContentFromBlob(messageContentBlobService, message.id)
              .mapLeft(toDocumentDeleteFailure)
          )
          .map(_ => some(content))
    );

/**
 * Find all versions of a message status, then backup and delete each document
 *
 * @param param0.messageStatusModel instance of MessageStatusModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.message parent message
 *
 */
const backupAndDeleteMessageStatus = ({
  messageStatusModel,
  userDataBackup,
  message
}: {
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly message: RetrievedMessageWithoutContent;
}): TaskEither<DataFailure, ReadonlyArray<RetrievedMessageStatus>> =>
  executeRecursiveBackupAndDelete<RetrievedMessageStatus>(
    item =>
      messageStatusModel.deleteMessageStatusVersion(item.messageId, item.id),
    userDataBackup,
    item => `message-status/${item.id}.json`,
    messageStatusModel.findAllVersionsByModelId(message.id)
  );

/**
 * For a given message, search all its notifications and backup&delete each one including its own notification status
 *
 * @param param0.message the message to search notification for
 * @param param0.notificationModel instance of NotificationModel
 * @param param0.notificationStatusModel instance of NotificationStatusModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 */
const backupAndDeleteAllNotificationsData = ({
  message,
  notificationModel,
  notificationStatusModel,
  userDataBackup
}: {
  readonly message: RetrievedMessageWithoutContent;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
}): TaskEither<QueryFailure, true> =>
  notificationModel.findNotificationForMessage(message.id).foldTaskEither(
    failure =>
      // There are cases in which a message has no notification.
      // We just consider the notification to be deleted
      failure.kind === "COSMOS_ERROR_RESPONSE" && failure.error.code === 404
        ? taskEither.of(true)
        : fromLeft(toQueryFailure(failure)),
    maybeNotification =>
      maybeNotification.fold(
        // There are cases in which a message has no notification.
        // We just consider the notification to be deleted
        taskEither.of(true),
        // For the found notification, we delete its statuses before deleting the notification itself
        notification =>
          backupAndDeleteNotificationStatus({
            notification,
            notificationStatusModel,
            userDataBackup
          })
            .chain(() =>
              backupAndDeleteNotification({
                notification,
                notificationModel,
                userDataBackup
              })
            )
            .bimap(e => toQueryFailure(new Error(e.reason)), () => true)
      )
  );

/**
 * For a given user, search all its messages and backup&delete each one including its own child models (messagestatus, notifications, message content)
 *
 * @param param0.messageContentBlobService instance of blob service where message contents are stored
 * @param param0.messageModel instance of MessageModel
 * @param param0.messageStatusModel instance of MessageStatusModel
 * @param param0.NotificationModel instance of NotificationModel
 * @param param0.notificationStatusModel instance of NotificationStatusModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.fiscalCode identifier of the user
 */
const backupAndDeleteAllMessagesData = ({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  notificationModel,
  notificationStatusModel,
  userDataBackup,
  fiscalCode
}: {
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly fiscalCode: FiscalCode;
}): TaskEither<DataFailure, unknown> =>
  messageModel
    .findMessages(fiscalCode)
    .mapLeft(toQueryFailure)
    .chain(iter => tryCatch(() => asyncIteratorToArray(iter), toQueryFailure))
    .map(flatten)
    .foldTaskEither(
      e => fromLeft(e),
      results =>
        results.some(isLeft)
          ? fromLeft(
              toQueryFailure(
                new Error("Cannot decode some element due to decoding errors")
              )
            )
          : array.sequence(taskEitherSeq)(
              rights(results).map(message => {
                // cast needed because findMessages has a wrong signature
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const retrievedMessage = (message as any) as RetrievedMessageWithoutContent;
                return sequenceT(taskEitherSeq)(
                  backupAndDeleteMessageContent({
                    message: retrievedMessage,
                    messageContentBlobService,
                    messageModel,
                    userDataBackup
                  }),
                  backupAndDeleteMessageStatus({
                    message: retrievedMessage,
                    messageStatusModel,
                    userDataBackup
                  }),
                  backupAndDeleteAllNotificationsData({
                    message: retrievedMessage,
                    notificationModel,
                    notificationStatusModel,
                    userDataBackup
                  })
                ).chain(() =>
                  backupAndDeleteMessage({
                    message: retrievedMessage,
                    messageModel,
                    userDataBackup
                  })
                );
              })
            )
    );

/**
 * Explores the user data structures and deletes all documents and blobs. Before that saves a blob for every found document in a dedicated storage folder
 * Versioned models are backupped with a blob for each document version.
 * Deletions happen after and only if the respective document has been successfully backupped.
 * Backups and deletions of parent models happen after and only if every child model has been backupped and deleted successfully (example: Message and MessageStatus).
 * This is important because children are found from their parents and otherwise it would create dangling models in case of an error occur.
 *
 * @param param0.messageContentBlobService instance of blob service where message contents are stored
 * @param param0.messageModel instance of MessageModel
 * @param param0.messageStatusModel instance of MessageStatusModel
 * @param param0.NotificationModel instance of NotificationModel
 * @param param0.notificationStatusModel instance of NotificationStatusModel
 * @param param0.profileModel instance of ProfileModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.fiscalCode identifier of the user
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const backupAndDeleteAllUserData = ({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  userDataBackup,
  fiscalCode
}: {
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly profileModel: ProfileDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly fiscalCode: FiscalCode;
}) =>
  backupAndDeleteAllMessagesData({
    fiscalCode,
    messageContentBlobService,
    messageModel,
    messageStatusModel,
    notificationModel,
    notificationStatusModel,
    userDataBackup
  }).chain(_ =>
    // eslint-disable-next-line sort-keys
    backupAndDeleteProfile({ profileModel, userDataBackup, fiscalCode })
  );
