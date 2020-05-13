/**
 * This activity extracts all the data about a user contained in our db.
 *
 */

import * as t from "io-ts";

import { sequenceS } from "fp-ts/lib/Apply";
import { array, flatten } from "fp-ts/lib/Array";
import { Either, fromOption, left, right } from "fp-ts/lib/Either";
import {
  fromEither,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { BlobService } from "azure-storage";
import { QueryError } from "documentdb";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import { NotificationChannelEnum } from "io-functions-commons/dist/generated/definitions/NotificationChannel";
import {
  MessageModel,
  MessageWithoutContent,
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import { RetrievedNotification } from "io-functions-commons/dist/src/models/notification";
import {
  NotificationStatus,
  NotificationStatusModel
} from "io-functions-commons/dist/src/models/notification_status";
import {
  Profile,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import {
  SenderService,
  SenderServiceModel
} from "io-functions-commons/dist/src/models/sender_service";
import { iteratorToArray } from "io-functions-commons/dist/src/utils/documentdb";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { NotificationModel, SafeNotification } from "./notification";

const MessageContentWithId = t.interface({
  content: MessageContent,
  messageId: NonEmptyString
});
export type MessageContentWithId = t.TypeOf<typeof MessageContentWithId>;

// the shape of the dataset to be extracted
export const AllUserData = t.interface({
  messageContents: t.readonlyArray(
    t.exact(MessageContentWithId),
    "MessageContentList"
  ),
  messages: t.readonlyArray(t.exact(MessageWithoutContent), "MessageList"),
  notificationStatuses: t.readonlyArray(
    t.exact(NotificationStatus),
    "NotificationStatusList"
  ),
  notifications: t.readonlyArray(t.exact(SafeNotification), "NotificationList"),
  profile: Profile,
  senderServices: t.readonlyArray(t.exact(SenderService), "SenderServiceList")
});
export type AllUserData = t.TypeOf<typeof AllUserData>;

// Activity input
export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity success result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: AllUserData
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

// Activity failed because of invalid input
const ActivityResultInvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type ActivityResultInvalidInputFailure = t.TypeOf<
  typeof ActivityResultInvalidInputFailure
>;

// Activity failed because of an error on a query
const ActivityResultQueryFailure = t.intersection([
  t.interface({
    kind: t.literal("QUERY_FAILURE"),
    reason: t.string
  }),
  t.partial({ query: t.string })
]);
export type ActivityResultQueryFailure = t.TypeOf<
  typeof ActivityResultQueryFailure
>;

// activity failed for user not found
const ActivityResultUserNotFound = t.interface({
  kind: t.literal("USER_NOT_FOUND_FAILURE")
});
export type ActivityResultUserNotFound = t.TypeOf<
  typeof ActivityResultUserNotFound
>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  ActivityResultUserNotFound,
  ActivityResultQueryFailure,
  ActivityResultInvalidInputFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `ExtractUserDataActivity`;

/**
 * Converts a Promise<Either> into a TaskEither
 * This is needed because our models return unconvenient type. Both left and rejection cases are handled as a TaskEither left
 * @param lazyPromise a lazy promise to convert
 * @param queryName an optional name for the query, for logging purpose
 *
 * @returns either the query result or a query failure
 */
const fromQueryEither = <R>(
  lazyPromise: () => Promise<Either<QueryError | Error, R>>,
  queryName: string = ""
): TaskEither<ActivityResultQueryFailure, R> =>
  tryCatch(lazyPromise, (err: Error) =>
    ActivityResultQueryFailure.encode({
      kind: "QUERY_FAILURE",
      query: queryName,
      reason: err.message
    })
  ).chain((queryErrorOrRecord: Either<QueryError | Error, R>) =>
    fromEither(
      queryErrorOrRecord.mapLeft(queryError =>
        ActivityResultQueryFailure.encode({
          kind: "QUERY_FAILURE",
          query: queryName,
          reason: JSON.stringify(queryError)
        })
      )
    )
  );

/**
 * To be used for exhaustive checks
 * @param _
 */
function assertNever(_: never): void {
  throw new Error("should not have executed this");
}

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
        `${logPrefix}|Error ${failure.query} query error |ERROR=${failure.reason}`
      );
      break;
    case "USER_NOT_FOUND_FAILURE":
      context.log.error(`${logPrefix}|Error user not found|ERROR=`);
      break;
    default:
      assertNever(failure);
  }
};

/**
 * Factory methods that builds an activity function
 *
 * @param messageModel
 * @param notificationModel
 * @param profileModel
 * @param senderServiceModel
 * @param blobService
 *
 * @returns an activity function in the form (Context, ActivityInput) -> Promise<Either<ActivityResultFailure, ActivityResultSuccess>>
 */
export const createExtractUserDataActivityHandler = (
  messageModel: MessageModel,
  notificationModel: NotificationModel,
  notificationStatusModel: NotificationStatusModel,
  profileModel: ProfileModel,
  senderServiceModel: SenderServiceModel,
  blobService: BlobService
  // tslint:disable-next-line: no-big-function
) => {
  /**
   * Look for a profile from a given fiscal code
   * @param fiscalCode a fiscal code identifying the user
   * @returns either a user profile, a query error or a user-not-found error
   */
  const taskifiedFindProfile = (
    fiscalCode: FiscalCode
  ): TaskEither<
    ActivityResultUserNotFound | ActivityResultQueryFailure,
    Profile
  > =>
    fromQueryEither(
      () => profileModel.findOneProfileByFiscalCode(fiscalCode),
      "findOneProfileByFiscalCode"
    ).foldTaskEither<
      ActivityResultUserNotFound | ActivityResultQueryFailure,
      Profile
    >(
      failure => fromEither(left(failure)),
      maybeProfile =>
        fromEither<ActivityResultUserNotFound, Profile>(
          fromOption(
            ActivityResultUserNotFound.encode({
              kind: "USER_NOT_FOUND_FAILURE"
            })
          )(maybeProfile)
        )
    );

  /**
   * Retrieves all contents for provided messages
   * @param messages
   */
  const getAllMessageContents = (
    messages: readonly RetrievedMessageWithoutContent[]
  ): TaskEither<
    ActivityResultQueryFailure,
    ReadonlyArray<MessageContentWithId>
  > =>
    array.sequence(taskEither)(
      messages.map(({ id: messageId }) =>
        fromQueryEither(
          () => messageModel.getContentFromBlob(blobService, messageId),
          "messageModel.getContentFromBlob"
        ).foldTaskEither<ActivityResultQueryFailure, MessageContentWithId>(
          failure => fromEither(left(failure)),
          maybeContent =>
            fromEither(
              fromOption(
                ActivityResultQueryFailure.encode({
                  kind: "QUERY_FAILURE",
                  query: "messageModel.getContentFromBlob",
                  reason: `Cannot find content for message ${messageId}`
                })
              )(maybeContent).map<MessageContentWithId>(
                (content: MessageContent) => ({
                  content,
                  messageId
                })
              )
            )
        )
      )
    );

  /**
   * Given a list of messages, get the relative notifications
   * @param messages
   */
  const findNotificationsForAllMessages = (
    messages: readonly RetrievedMessageWithoutContent[]
  ): TaskEither<
    ActivityResultQueryFailure,
    ReadonlyArray<RetrievedNotification>
  > =>
    array
      .sequence(taskEither)(
        messages.map(m =>
          fromQueryEither<ReadonlyArray<RetrievedNotification>>(
            () =>
              iteratorToArray(
                notificationModel.findNotificationsForMessage(m.id)
              ),
            "findNotificationsForRecipient"
          )
        )
      )
      .foldTaskEither(
        e => fromEither(left(e)),
        arrayOfArray =>
          // tslint:disable-next-line: readonly-array
          fromEither(right(flatten(arrayOfArray as RetrievedNotification[][])))
      );

  const findAllNotificationStatuses = (
    notifications: ReadonlyArray<RetrievedNotification>
  ): TaskEither<
    ActivityResultQueryFailure,
    ReadonlyArray<NotificationStatus>
  > =>
    array
      .sequence(taskEither)(
        // compose a query for every supported channel type
        notifications
          .reduce(
            (queries, { id: notificationId }) => [
              ...queries,
              ...Object.values(NotificationChannelEnum).map(channel => {
                switch (channel) {
                  case NotificationChannelEnum.EMAIL:
                  case NotificationChannelEnum.WEBHOOK:
                    return [notificationId, channel];
                  default:
                    assertNever(channel);
                }
              })
            ],
            []
          )
          .map(([notificationId, channel]) =>
            fromQueryEither(
              () =>
                notificationStatusModel.findOneNotificationStatusByNotificationChannel(
                  notificationId,
                  channel
                ),
              "findOneNotificationStatusByNotificationChannel"
            )
          )
      )
      // filter empty results (it might not exist a content for a pair notification/channel)
      .foldTaskEither<
        ActivityResultQueryFailure,
        ReadonlyArray<NotificationStatus>
      >(
        e => fromEither(left(e)),
        arrayOfMaybeNotification => {
          return fromEither(
            right(
              arrayOfMaybeNotification
                // lift Option<T>[] to T[] by filtering all nones
                .map(opt => opt.getOrElse(undefined))
                .filter(value => typeof value !== "undefined")
            )
          );
        }
      );

  /**
   * Perform all the queries to extract all data for a given user
   * @param fiscalCode user identifier
   * @returns Either a failure or a hash set with all the information regarding the user
   */
  const queryAllUserData = (
    fiscalCode: FiscalCode
  ): TaskEither<
    ActivityResultUserNotFound | ActivityResultQueryFailure,
    AllUserData
  > =>
    // step 0: look for the profile
    taskifiedFindProfile(fiscalCode)
      // step 1: get messages, which can be queried by only knowing the fiscal code
      .chain(profile =>
        sequenceS(taskEither)({
          // queries all messages for the user
          messages: fromQueryEither<ReadonlyArray<RetrievedMessageWithContent>>(
            () => iteratorToArray(messageModel.findMessages(fiscalCode)),
            "findMessages"
          ),
          profile: taskEither.of(profile)
        })
      )
      // step 2: queries notifications and message contents, which need message data to be queried first
      .chain(({ profile, messages }) => {
        // tslint:disable-next-line: no-any
        const asRetrievedMessages = (messages as any) as readonly RetrievedMessageWithoutContent[]; // this cast is needed because messageModel.findMessages is erroneously marked as RetrievedMessageWithContent, although content isn't included
        const allData: TaskEither<
          ActivityResultUserNotFound | ActivityResultQueryFailure,
          {
            messages: ReadonlyArray<MessageWithoutContent>;
            messageContents: ReadonlyArray<MessageContentWithId>;
            profile: Profile;
            notifications: ReadonlyArray<RetrievedNotification>;
          }
          // tslint:disable-next-line: prefer-immediate-return
        > = sequenceS(taskEither)({
          messageContents: getAllMessageContents(asRetrievedMessages),
          messages: taskEither.of(messages),
          notifications: findNotificationsForAllMessages(asRetrievedMessages),
          profile: taskEither.of(profile)
        });
        return allData;
      })
      // step 3: queries notifications statuses
      .chain(({ profile, messages, messageContents, notifications }) => {
        return sequenceS(taskEither)({
          messageContents: taskEither.of(messageContents),
          messages: taskEither.of(messages),
          notificationStatuses: findAllNotificationStatuses(notifications),
          notifications: taskEither.of(notifications),
          profile: taskEither.of(profile),
          senderServices: fromQueryEither<ReadonlyArray<SenderService>>(
            () =>
              iteratorToArray(
                senderServiceModel.findSenderServicesForRecipient(fiscalCode)
              ),
            "findSenderServicesForRecipient"
          )
        });
      });

  // the actual handler
  return (context: Context, input: unknown) =>
    fromEither(ActivityInput.decode(input))
      .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
        ActivityResultInvalidInputFailure.encode({
          kind: "INVALID_INPUT_FAILURE",
          reason: readableReport(reason)
        })
      )
      .chain(({ fiscalCode }) => queryAllUserData(fiscalCode))
      .map(allUserData =>
        ActivityResultSuccess.encode({
          kind: "SUCCESS",
          value: allUserData
        })
      )
      .mapLeft(failure => {
        logFailure(context)(failure);
        return failure;
      })
      .run();
};
