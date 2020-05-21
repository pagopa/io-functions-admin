/**
 * This activity extracts all the data about a user contained in our db.
 */

import * as t from "io-ts";

import { sequenceT } from "fp-ts/lib/Apply";
import { array } from "fp-ts/lib/Array";
import { Either, left, toError } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import {
  fromEither,
  TaskEither,
  taskEither,
  taskEitherSeq,
  taskify,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { BlobService } from "azure-storage";
import { QueryError } from "documentdb";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import {
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import { RetrievedMessageStatus } from "io-functions-commons/dist/src/models/message_status";
import { RetrievedNotification } from "io-functions-commons/dist/src/models/notification";
import { RetrievedNotificationStatus } from "io-functions-commons/dist/src/models/notification_status";
import { RetrievedProfile } from "io-functions-commons/dist/src/models/profile";
import { UserDataProcessingId } from "io-functions-commons/dist/src/models/user_data_processing";
import {
  IResultIterator,
  iteratorToArray
} from "io-functions-commons/dist/src/utils/documentdb";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { MessageModel } from "../utils/models/message";
import { MessageStatusModel } from "../utils/models/message_status";
import { NotificationModel } from "../utils/models/notification";
import { NotificationStatusModel } from "../utils/models/notification_status";
import { ProfileModel } from "../utils/models/profile";

// Activity input
export const ActivityInput = t.interface({
  fiscalCode: FiscalCode,
  userDataDeleteRequestId: UserDataProcessingId
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity success result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

// Activity failed because of invalid input
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;

// Activity failed because of an error on a query
export const QueryFailure = t.intersection([
  t.interface({
    kind: t.literal("QUERY_FAILURE"),
    reason: t.string
  }),
  t.partial({ query: t.string })
]);
export type QueryFailure = t.TypeOf<typeof QueryFailure>;

// activity failed for user not found
export const UserNotFound = t.interface({
  kind: t.literal("USER_NOT_FOUND_FAILURE")
});
export type UserNotFound = t.TypeOf<typeof UserNotFound>;

// activity failed while deleting a document from the db
export const DocumentDeleteFailure = t.interface({
  kind: t.literal("DELETE_FAILURE"),
  reason: t.string
});
export type DocumentDeleteFailure = t.TypeOf<typeof DocumentDeleteFailure>;

// activity failed while creating a new blob on storage
export const BlobCreationFailure = t.interface({
  kind: t.literal("BLOB_FAILURE"),
  reason: t.string
});
export type BlobCreationFailure = t.TypeOf<typeof BlobCreationFailure>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  UserNotFound,
  QueryFailure,
  InvalidInputFailure,
  BlobCreationFailure,
  DocumentDeleteFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `DeleteUserDataActivity`;

/**
 * Converts a Promise<Either> into a TaskEither
 * This is needed because our models return unconvenient type. Both left and rejection cases are handled as a TaskEither left
 * @param lazyPromise a lazy promise to convert
 * @param queryName an optional name for the query, for logging purpose
 *
 * @returns either the query result or a query failure
 */
const fromQueryEither = <R>(
  lazyPromise: () => Promise<Either<QueryError | Error, R>>
): TaskEither<Error, R> =>
  tryCatch(lazyPromise, toError).chain(errorOrResult =>
    fromEither(errorOrResult).mapLeft((err: QueryError | Error) =>
      err instanceof Error
        ? err
        : new Error(`QueryError: ${JSON.stringify(err)}`)
    )
  );

/**
 * To be used for exhaustive checks
 */
function assertNever(_: never): void {
  throw new Error("should not have executed this");
}

/**
 * to cast an error to QueryFailure
 * @param err
 */
const toQueryFailure = (err: Error | QueryError): QueryFailure =>
  QueryFailure.encode({
    kind: "QUERY_FAILURE",
    reason:
      err instanceof Error ? err.message : `QueryError: ${JSON.stringify(err)}`
  });

/**
 * to cast an error to a DocumentDeleteFailure
 * @param err
 */
const toDocumentDeleteFailure = (err: Error): DocumentDeleteFailure =>
  DocumentDeleteFailure.encode({
    kind: "DELETE_FAILURE",
    reason: err.message
  });

/**
 * Logs depending on failure type
 * @param context the Azure functions context
 * @param failure the failure to log
 */
const logFailure = (context: Context) => (
  failure: ActivityResultFailure
): void => {
  switch (failure.kind) {
    case "INVALID_INPUT_FAILURE":
      context.log.error(
        `${logPrefix}|Error decoding input|ERROR=${failure.reason}`
      );
      break;
    case "QUERY_FAILURE":
      context.log.error(
        `${logPrefix}|Error ${failure.query} query error|ERROR=${failure.reason}`
      );
      break;
    case "BLOB_FAILURE":
      context.log.error(
        `${logPrefix}|Error saving zip bundle|ERROR=${failure.reason}`
      );
      break;
    case "USER_NOT_FOUND_FAILURE":
      context.log.error(`${logPrefix}|Error user not found|ERROR=`);
      break;
    case "DELETE_FAILURE":
      context.log.error(
        `${logPrefix}|Error deleting data|ERROR=${failure.reason}`
      );
      break;
    default:
      assertNever(failure);
  }
};

// define a value object with the info related to the blob storage for backup files
interface IBlobServiceInfo {
  blobService: BlobService;
  containerName: string;
  folder?: NonEmptyString;
}

/**
 * Saves data into a dedicated blob
 * @param blobServiceInfo references about where to save data
 * @param blobName name of the blob to be saved. It might not include a folder if specified in blobServiceInfo
 * @param data serializable data to be saved
 *
 * @returns either a blob failure or the saved object
 */
export const saveDataToBlob = <T>(
  { blobService, containerName, folder }: IBlobServiceInfo,
  blobName: string,
  data: T
): TaskEither<BlobCreationFailure, T> =>
  taskify(blobService.createBlockBlobFromText)(
    containerName,
    `${folder}${folder ? "/" : ""}${blobName}`,
    JSON.stringify(data)
  ).bimap(
    err =>
      BlobCreationFailure.encode({
        kind: "BLOB_FAILURE",
        reason: err.message
      }),
    _ => data
  );

/**
 * Recursively consumes an iterator and executes operations on every item
 * @param deleteSingle takes an item and delete it
 * @param userDataBackup references about where to save data
 * @param makeBackupBlobName takes an item and construct a name for the backup blob
 * @param iterator an iterator of every result from the db
 */
const executeRecursiveBackupAndDelete = <T>(
  deleteSingle: (item: T) => Promise<Either<QueryError, string>>,
  userDataBackup: IBlobServiceInfo,
  makeBackupBlobName: (item: T) => string,
  iterator: IResultIterator<T>
): TaskEither<
  // tslint:disable-next-line: use-type-alias
  QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
  readonly T[]
> => {
  return (
    tryCatch(iterator.executeNext, toError)
      // this is just type lifting
      .foldTaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        Option<readonly T[]>
      >(
        e => fromEither(left(toQueryFailure(e))),
        e => fromEither(e).mapLeft(toQueryFailure)
      )
      .foldTaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        readonly T[]
      >(
        e => fromEither(left(e)),
        maybeResults =>
          maybeResults.fold(
            // if the iterator content is none, exit the recursion
            taskEither.of([]),
            items =>
              // executes backup&delete for this set of items
              array.sequence(taskEither)(
                items.map((item: T) =>
                  sequenceT(taskEitherSeq)<
                    BlobCreationFailure | QueryFailure | DocumentDeleteFailure,
                    // tslint:disable-next-line: readonly-array
                    [
                      TaskEither<
                        | QueryFailure
                        | BlobCreationFailure
                        | DocumentDeleteFailure,
                        T
                      >,
                      TaskEither<
                        | QueryFailure
                        | BlobCreationFailure
                        | DocumentDeleteFailure,
                        string
                      >,
                      // tslint:disable-next-line: readonly-array
                      TaskEither<
                        | QueryFailure
                        | BlobCreationFailure
                        | DocumentDeleteFailure,
                        readonly T[]
                      >
                    ]
                  >(
                    saveDataToBlob<T>(
                      userDataBackup,
                      makeBackupBlobName(item),
                      item
                    ),
                    fromQueryEither(() => deleteSingle(item)).mapLeft(
                      toDocumentDeleteFailure
                    ),
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
          )
      )
  );
};

/**
 * Backup and delete every version of the profile
 *
 * @param param0.profileModel instance of ProfileModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.fiscalCode the identifier of the user
 */
const backupAndDeleteProfile = ({
  fiscalCode,
  profileModel,
  userDataBackup
}: {
  profileModel: ProfileModel;
  userDataBackup: IBlobServiceInfo;
  fiscalCode: FiscalCode;
}) => {
  return executeRecursiveBackupAndDelete<RetrievedProfile>(
    item => profileModel.deleteProfileVersion(item.fiscalCode, item.id),
    userDataBackup,
    item => `profile--${item.version}.json`,
    profileModel.findAllVersionsByModelId(fiscalCode)
  );
};

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
  notificationModel: NotificationModel;
  userDataBackup: IBlobServiceInfo;
  notification: RetrievedNotification;
}): TaskEither<
  BlobCreationFailure | QueryFailure | DocumentDeleteFailure,
  RetrievedNotification
> => {
  return sequenceT(taskEitherSeq)<
    QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
    // tslint:disable-next-line: readonly-array
    [
      TaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        RetrievedNotification
      >,
      TaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        string
      >
    ]
  >(
    saveDataToBlob<RetrievedNotification>(
      userDataBackup,
      `notification--${notification.id}.json`,
      notification
    ),
    fromQueryEither(() =>
      notificationModel.deleteNotification(
        notification.messageId,
        notification.id
      )
    ).mapLeft(toDocumentDeleteFailure)
  ).map(_ => notification);
};

/**
 * Find all versions of a notification status, then backup and delete each document
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
  notificationStatusModel: NotificationStatusModel;
  userDataBackup: IBlobServiceInfo;
  notification: RetrievedNotification;
}): TaskEither<
  QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
  readonly RetrievedNotificationStatus[]
> => {
  return executeRecursiveBackupAndDelete<RetrievedNotificationStatus>(
    item =>
      notificationStatusModel.deleteNotificationStatusVersion(
        item.notificationId,
        item.id
      ),
    userDataBackup,
    item => `notification-status--${item.version}.json`,
    notificationStatusModel.findAllVersionsByModelId(notification.id)
  );
};

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
  messageModel: MessageModel;
  userDataBackup: IBlobServiceInfo;
  message: RetrievedMessageWithoutContent;
}): TaskEither<
  BlobCreationFailure | QueryFailure | DocumentDeleteFailure,
  RetrievedMessageWithoutContent
> => {
  return sequenceT(taskEitherSeq)<
    QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
    // tslint:disable-next-line: readonly-array
    [
      TaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        RetrievedMessageWithoutContent
      >,
      TaskEither<
        QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
        string
      >
    ]
  >(
    saveDataToBlob<RetrievedMessageWithoutContent>(
      userDataBackup,
      `message--${message.id}.json`,
      message
    ),
    fromQueryEither(() =>
      messageModel.deleteMessage(message.fiscalCode, message.id)
    ).mapLeft(toDocumentDeleteFailure)
  ).map(_ => message);
};

const backupAndDeleteMessageContent = (): TaskEither<
  BlobCreationFailure | QueryFailure | DocumentDeleteFailure,
  MessageContent
> => taskEither.of({} as MessageContent);

/**
 * Find all versions of a message status, then backup and delete each document
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
  messageStatusModel: MessageStatusModel;
  userDataBackup: IBlobServiceInfo;
  message: RetrievedMessageWithoutContent;
}): TaskEither<
  QueryFailure | BlobCreationFailure | DocumentDeleteFailure,
  readonly RetrievedMessageStatus[]
> => {
  return executeRecursiveBackupAndDelete<RetrievedMessageStatus>(
    item =>
      messageStatusModel.deleteMessageStatusVersion(item.messageId, item.id),
    userDataBackup,
    item => `message-status--${item.version}.json`,
    messageStatusModel.findAllVersionsByModelId(message.id)
  );
};

/**
 * Explores the user data structures and deletes all documents and blobs. Before that saves a blob for every found document in a dedicated storage folder
 * Versioned models are backupped with a blob for each document version.
 * Deletions happen after and only if the respective document has been successfully backupped.
 * Backups and deletions of parent models happen after and only if every child model has been backupped and deleted successfully (example: Message and MessageStatus).
 * This is important because children are found from their parents and otherwise it would create dangling models in case of an error occur.
 *
 * @param param0.messageModel instance of MessageModel
 * @param param0.messageStatusModel instance of MessageStatusModel
 * @param param0.profileModel instance of ProfileModel
 * @param param0.userDataBackup information about the blob storage account to place backup into
 * @param param0.fiscalCode identifier of the user
 */
export const backupAndDeleteAllUserData = ({
  messageModel,
  messageStatusModel,
  profileModel,
  userDataBackup,
  fiscalCode
}: {
  messageModel: MessageModel;
  messageStatusModel: MessageStatusModel;
  profileModel: ProfileModel;
  userDataBackup: IBlobServiceInfo;
  fiscalCode: FiscalCode;
}) => {
  return fromQueryEither<ReadonlyArray<RetrievedMessageWithContent>>(() =>
    iteratorToArray(messageModel.findMessages(fiscalCode))
  )
    .mapLeft(toQueryFailure)
    .foldTaskEither(
      e => fromEither(left(e)),
      messages => {
        return array.sequence(taskEither)(
          messages.map(message => {
            // cast needed because findMessages has a wrong signature
            // tslint:disable-next-line: no-any
            const retrievedMessage = (message as any) as RetrievedMessageWithoutContent;
            return sequenceT(taskEitherSeq)(
              backupAndDeleteMessageContent(),
              backupAndDeleteMessageStatus({
                message: retrievedMessage,
                messageStatusModel,
                userDataBackup
              }),
              backupAndDeleteMessage({
                message: retrievedMessage,
                messageModel,
                userDataBackup
              })
            );
          })
        );
      }
    )
    .chain(_ =>
      backupAndDeleteProfile({ profileModel, userDataBackup, fiscalCode })
    );
};
export interface IActivityHandlerInput {
  messageModel: MessageModel;
  messageStatusModel: MessageStatusModel;
  notificationModel: NotificationModel;
  notificationStatusModel: NotificationStatusModel;
  profileModel: ProfileModel;
  messageContentBlobService: BlobService;
  userDataBackupBlobService: BlobService;
  userDataBackupContainerName: NonEmptyString;
}

/**
 * Factory methods that builds an activity function
 */
export function createDeleteUserDataActivityHandler({
  messageModel,
  messageStatusModel,
  profileModel,
  userDataBackupBlobService,
  userDataBackupContainerName
}: IActivityHandlerInput): (
  context: Context,
  input: unknown
) => Promise<ActivityResult> {
  return (context: Context, input: unknown) =>
    fromEither(
      ActivityInput.decode(input).mapLeft<ActivityResultFailure>(
        (reason: t.Errors) =>
          InvalidInputFailure.encode({
            kind: "INVALID_INPUT_FAILURE",
            reason: readableReport(reason)
          })
      )
    )
      .chain(({ fiscalCode, userDataDeleteRequestId }) =>
        backupAndDeleteAllUserData({
          fiscalCode,
          messageModel,
          messageStatusModel,
          profileModel,
          userDataBackup: {
            blobService: userDataBackupBlobService,
            containerName: userDataBackupContainerName,
            folder: `${userDataDeleteRequestId}-${Date.now()}` as NonEmptyString
          }
        })
      )
      .bimap(
        failure => {
          logFailure(context)(failure);
          return failure;
        },
        _ =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS"
          })
      )
      .run()
      .then(e => e.value);
}
