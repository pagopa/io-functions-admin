import { BlobService } from "azure-storage";
import { sequenceT } from "fp-ts/lib/Apply";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import { array, flatten, rights } from "fp-ts/lib/Array";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import {
  RetrievedMessage,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { RetrievedNotification } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { RetrievedNotificationStatus } from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { asyncIteratorToArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import { RetrievedServicePreference } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { flow, pipe } from "fp-ts/lib/function";
import { RetrievedMessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { MessageDeletableModel } from "../utils/extensions/models/message";
import { MessageStatusDeletableModel } from "../utils/extensions/models/message_status";
import { NotificationDeletableModel } from "../utils/extensions/models/notification";
import { NotificationStatusDeletableModel } from "../utils/extensions/models/notification_status";
import { ProfileDeletableModel } from "../utils/extensions/models/profile";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { MessageViewDeletableModel } from "../utils/extensions/models/message_view";
import {
  BlobCreationFailure,
  DataFailure,
  DocumentDeleteFailure,
  IBlobServiceInfo,
  QueryFailure
} from "./types";
import { saveDataToBlob } from "./utils";
import { toDocumentDeleteFailure, toQueryFailure } from "./utils";
import AuthenticationLockService, {
  AuthenticationLockData
} from "./authenticationLockService";

/**
 * Recursively consumes an iterator and executes operations on every item
 *
 * @param deleteSingle takes an item and delete it
 * @param userDataBackup references about where to save data
 * @param makeBackupBlobName takes an item and construct a name for the backup blob
 * @param iterator an iterator of every result from the db
 */
const executeRecursiveBackupAndDelete = <T>(
  deleteSingle: (item: T) => TE.TaskEither<CosmosErrors, string>,
  userDataBackup: IBlobServiceInfo,
  makeBackupBlobName: (item: T) => string,
  iterator: AsyncIterator<ReadonlyArray<E.Either<Errors, T>>>
): TE.TaskEither<DataFailure, ReadonlyArray<T>> =>
  pipe(
    TE.tryCatch(() => iterator.next(), E.toError),
    TE.mapLeft(toQueryFailure),
    TE.chainW(e =>
      e.done
        ? TE.of([])
        : e.value.some(E.isLeft)
        ? TE.left(
            toQueryFailure(new Error("Some elements are not typed correctly"))
          )
        : TE.of(rights(e.value))
    ),
    // executes backup&delete for this set of items
    TE.chainW(items =>
      pipe(
        items,
        A.map((item: T) =>
          pipe(
            sequenceT(TE.ApplicativeSeq)<
              DataFailure,
              // eslint-disable-next-line functional/prefer-readonly-type
              [
                TE.TaskEither<DataFailure, T>,
                TE.TaskEither<DataFailure, string>,
                // eslint-disable-next-line functional/prefer-readonly-type
                TE.TaskEither<DataFailure, ReadonlyArray<T>>
              ]
            >(
              saveDataToBlob<T>(userDataBackup, makeBackupBlobName(item), item),
              pipe(item, deleteSingle, TE.mapLeft(toDocumentDeleteFailure)),
              // recursive step
              executeRecursiveBackupAndDelete<T>(
                deleteSingle,
                userDataBackup,
                makeBackupBlobName,
                iterator
              )
            ),
            // aggregates the results at the end of the recursion
            TE.map(([_, __, nextResults]) => [item, ...nextResults])
          )
        ),
        A.sequence(TE.ApplicativePar),
        TE.map(flatten)
      )
    )
  );

const backupAndDeleteAuthenticationLockData = (
  authenticationLockService: AuthenticationLockService,
  userDataBackup: IBlobServiceInfo,
  fiscalCode: FiscalCode,
  data: ReadonlyArray<AuthenticationLockData>
): TE.TaskEither<DataFailure, true> =>
  pipe(
    saveDataToBlob(userDataBackup, "access/authentication-locks.json", data),
    TE.mapLeft(e =>
      BlobCreationFailure.encode({
        kind: "BLOB_FAILURE",
        reason: `backupAndDeleteAuthenticationLockData|${e.reason}`
      })
    ),
    TE.chainW(_ =>
      pipe(
        authenticationLockService.deleteUserAuthenticationLockData(
          fiscalCode,
          data.map(v => v.rowKey)
        ),
        TE.mapLeft(e =>
          DocumentDeleteFailure.encode({
            kind: "DELETE_FAILURE",
            reason: `backupAndDeleteAuthenticationLockData|${e.message}`
          })
        )
      )
    )
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
  authenticationLockService,
  fiscalCode,
  profileModel,
  servicePreferencesModel,
  userDataBackup
}: {
  readonly authenticationLockService: AuthenticationLockService;
  readonly profileModel: ProfileDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly servicePreferencesModel: ServicePreferencesDeletableModel;
  readonly fiscalCode: FiscalCode;
}): TE.TaskEither<DataFailure, true> =>
  pipe(
    executeRecursiveBackupAndDelete<RetrievedProfile>(
      item => profileModel.deleteProfileVersion(item.fiscalCode, item.id),
      userDataBackup,
      item => `profile/${item.id}.json`,
      profileModel.findAllVersionsByModelId(fiscalCode)
    ),
    TE.chainW(_ =>
      executeRecursiveBackupAndDelete<RetrievedServicePreference>(
        item => servicePreferencesModel.delete(item.id, item.fiscalCode),
        userDataBackup,
        item => `service-settings/${item.id}.json`,
        servicePreferencesModel.findAllByFiscalCode(fiscalCode)
      )
    ),
    TE.chainW(_ =>
      pipe(
        authenticationLockService.getAllUserAuthenticationLockData(fiscalCode),
        TE.mapLeft(e =>
          QueryFailure.encode({
            kind: "QUERY_FAILURE",
            reason: `backupAndDeleteAuthenticationLockData|${e.message}`
          })
        ),
        TE.chain(data =>
          data.length > 0
            ? backupAndDeleteAuthenticationLockData(
                authenticationLockService,
                userDataBackup,
                fiscalCode,
                data
              )
            : TE.of(true)
        )
      )
    ),
    TE.foldW(
      () => TE.of(true as const),
      _ => TE.of(true as const)
    )
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
}): TE.TaskEither<DataFailure, RetrievedNotification> =>
  pipe(
    sequenceT(TE.ApplicativeSeq)<
      DataFailure,
      // eslint-disable-next-line functional/prefer-readonly-type
      [
        TE.TaskEither<DataFailure, RetrievedNotification>,
        TE.TaskEither<DataFailure, string>
      ]
    >(
      saveDataToBlob(
        userDataBackup,
        `notification/${notification.id}.json`,
        notification
      ),

      pipe(
        notificationModel.deleteNotification(
          notification.messageId,
          notification.id
        ),
        TE.mapLeft(toDocumentDeleteFailure)
      )
    ),
    TE.map(_ => notification)
  );

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
}): TE.TaskEither<DataFailure, ReadonlyArray<RetrievedNotificationStatus>> =>
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
 * @param param0.messageViewModel instance of MessageViewModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.message the message
 */
const backupAndDeleteMessageView = ({
  messageViewModel,
  userDataBackup,
  message
}: {
  readonly messageViewModel: MessageViewDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly message: RetrievedMessage;
}): TE.TaskEither<DataFailure, O.Option<RetrievedMessageView>> =>
  pipe(
    messageViewModel.find([message.id, message.fiscalCode]),
    TE.chain(TE.fromOption(() => undefined)),
    TE.foldW(
      _ =>
        // unfortunately, a document not found is threated like a query error
        TE.of(O.none),
      messageView =>
        pipe(
          saveDataToBlob(
            userDataBackup,
            `message-view/${message.id}.json`,
            messageView
          ),
          TE.chainW(_ =>
            pipe(
              messageViewModel.deleteMessageView(
                message.fiscalCode,
                message.id
              ),
              TE.mapLeft(toDocumentDeleteFailure)
            )
          ),
          TE.map(_ => O.some(messageView))
        )
    )
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
}): TE.TaskEither<DataFailure, RetrievedMessageWithoutContent> =>
  pipe(
    sequenceT(TE.ApplicativeSeq)<
      DataFailure,
      // eslint-disable-next-line functional/prefer-readonly-type
      [
        TE.TaskEither<DataFailure, RetrievedMessageWithoutContent>,
        TE.TaskEither<DataFailure, string>
      ]
    >(
      saveDataToBlob<RetrievedMessageWithoutContent>(
        userDataBackup,
        `message/${message.id}.json`,
        message
      ),

      pipe(
        messageModel.deleteMessage(message.fiscalCode, message.id),
        TE.mapLeft(toDocumentDeleteFailure)
      )
    ),
    TE.map(_ => message)
  );

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
}): TE.TaskEither<DataFailure, O.Option<MessageContent>> =>
  pipe(
    messageModel.getContentFromBlob(messageContentBlobService, message.id),
    TE.chain(TE.fromOption(() => undefined)),
    TE.foldW(
      _ =>
        // unfortunately, a document not found is threated like a query error
        TE.of(O.none),
      content =>
        pipe(
          saveDataToBlob(
            userDataBackup,
            `message-content/${message.id}.json`,
            content
          ),
          TE.chainW(_ =>
            pipe(
              messageModel.deleteContentFromBlob(
                messageContentBlobService,
                message.id
              ),
              TE.mapLeft(toDocumentDeleteFailure)
            )
          ),
          TE.map(_ => O.some(content))
        )
    )
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
}): TE.TaskEither<DataFailure, ReadonlyArray<RetrievedMessageStatus>> =>
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
}): TE.TaskEither<QueryFailure, true> =>
  pipe(
    notificationModel.findNotificationForMessage(message.id),
    TE.fold(
      // There are cases in which a message has no notification.
      // We just consider the notification to be deleted
      failure =>
        failure.kind === "COSMOS_ERROR_RESPONSE" && failure.error.code === 404
          ? TE.of(true)
          : TE.left(toQueryFailure(failure)),

      flow(
        TE.fromOption(() => void 0 /* anything will do */),
        TE.fold(
          // There are cases in which a message has no notification.
          // We just consider the notification to be deleted
          () => TE.of(true),
          // For the found notification, we delete its statuses before deleting the notification itself
          notification =>
            pipe(
              backupAndDeleteNotificationStatus({
                notification,
                notificationStatusModel,
                userDataBackup
              }),
              TE.chain(() =>
                backupAndDeleteNotification({
                  notification,
                  notificationModel,
                  userDataBackup
                })
              ),
              TE.bimap(
                e => toQueryFailure(new Error(e.reason)),
                () => true
              )
            )
        )
      )
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
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  userDataBackup,
  fiscalCode
}: {
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly messageViewModel: MessageViewDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly fiscalCode: FiscalCode;
}): TE.TaskEither<DataFailure, unknown> =>
  pipe(
    messageModel.findMessages(fiscalCode),
    TE.mapLeft(toQueryFailure),
    TE.chain(iter =>
      TE.tryCatch(() => asyncIteratorToArray(iter), toQueryFailure)
    ),
    TE.map(flatten),
    TE.chainW(results =>
      results.some(E.isLeft)
        ? TE.left(
            toQueryFailure(
              new Error("Cannot decode some element due to decoding errors")
            )
          )
        : array.sequence(TE.ApplicativeSeq)(
            rights(results).map(message => {
              // cast needed because findMessages has a wrong signature
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const retrievedMessage = (message as any) as RetrievedMessageWithoutContent;
              return pipe(
                sequenceT(TE.ApplicativeSeq)(
                  backupAndDeleteMessageView({
                    message: retrievedMessage,
                    messageViewModel,
                    userDataBackup
                  }),
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
                ),
                TE.chain(() =>
                  backupAndDeleteMessage({
                    message: retrievedMessage,
                    messageModel,
                    userDataBackup
                  })
                )
              );
            })
          )
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
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  servicePreferencesModel,
  userDataBackup,
  authenticationLockService,
  fiscalCode
}: {
  readonly authenticationLockService: AuthenticationLockService;
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageDeletableModel;
  readonly messageStatusModel: MessageStatusDeletableModel;
  readonly messageViewModel: MessageViewDeletableModel;
  readonly notificationModel: NotificationDeletableModel;
  readonly notificationStatusModel: NotificationStatusDeletableModel;
  readonly profileModel: ProfileDeletableModel;
  readonly servicePreferencesModel: ServicePreferencesDeletableModel;
  readonly userDataBackup: IBlobServiceInfo;
  readonly fiscalCode: FiscalCode;
}) =>
  pipe(
    backupAndDeleteAllMessagesData({
      fiscalCode,
      messageContentBlobService,
      messageModel,
      messageStatusModel,
      messageViewModel,
      notificationModel,
      notificationStatusModel,
      userDataBackup
    }),
    TE.chainW(_ =>
      // eslint-disable-next-line sort-keys
      backupAndDeleteProfile({
        authenticationLockService,
        fiscalCode,
        profileModel,
        servicePreferencesModel,
        userDataBackup
      })
    )
  );
