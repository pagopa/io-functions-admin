/**
 * This activity extracts all the data about a user contained in our db.
 *
 */

import * as t from "io-ts";

import { sequenceS, sequenceT } from "fp-ts/lib/Apply";
import { Either, fromOption, left, right } from "fp-ts/lib/Either";
import {
  fromEither,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { BlobService } from "azure-storage";
import {
  QueryError,
  RetrievedDocument as RetrievedDocumentT
} from "documentdb";
import { MessageContent } from "io-functions-commons/dist/generated/definitions/MessageContent";
import {
  MessageModel,
  MessageWithContent,
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent
} from "io-functions-commons/dist/src/models/message";
import {
  Notification,
  RetrievedNotification
} from "io-functions-commons/dist/src/models/notification";
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
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NotificationModel } from "./notification";

// the shape of the dataset to be extracted
const AllUserData = t.interface({
  messages: t.readonlyArray(MessageWithContent, "MessageList"),
  notifications: t.readonlyArray(Notification, "NotificationList"),
  profile: Profile,
  senderServices: t.readonlyArray(SenderService, "SenderServiceList")
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
      context.log.error(`${logPrefix}|Error user not found |ERROR=`);
      break;
    default:
      assertNever(failure);
  }
};

/**
 * Skims a db document from db-related fields
 * @param doc the document as retrieved from db
 *
 * @returns the same document without db metadata
 */
const fromRetrievedDbDocument = <T>(doc: T & RetrievedDocumentT): T => {
  const RETRIEVED_DOCUMENT_KEYS: ReadonlyArray<keyof RetrievedDocumentT> = [
    "_self",
    "_ts",
    "_attachments",
    "_etag",
    "_rid"
  ];
  return Object.entries(doc).reduce(
    (p: T, [key, value]) =>
      RETRIEVED_DOCUMENT_KEYS.includes(key) ? p : { ...p, [key]: value },
    {} as T
  );
};

/**
 * Safely compose a message with a messa with its content
 * @param messageFromDb a message as it's stored in db
 * @param content a content for the message
 *
 * @returns a new message with content included
 */
const appendContentToMessage = (
  messageFromDb: RetrievedMessageWithoutContent,
  content: MessageContent
): MessageWithContent => ({
  content: {
    due_date: content.due_date,
    markdown: content.markdown,
    payment_data: content.payment_data,
    prescription_data: content.prescription_data
      ? {
          iup: content.prescription_data
            ? content.prescription_data.iup
            : undefined,
          nre: content.prescription_data
            ? content.prescription_data.nre
            : undefined,
          prescriber_fiscal_code: content.prescription_data
            ? content.prescription_data.prescriber_fiscal_code
            : undefined
        }
      : undefined,
    subject: content.subject
  },
  createdAt: messageFromDb.createdAt,
  fiscalCode: messageFromDb.fiscalCode,
  indexedId: messageFromDb.indexedId,
  isPending: messageFromDb.isPending,
  senderServiceId: messageFromDb.senderServiceId,
  senderUserId: messageFromDb.senderUserId,
  timeToLiveSeconds: messageFromDb.timeToLiveSeconds
});

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
  profileModel: ProfileModel,
  senderServiceModel: SenderServiceModel,
  blobService: BlobService
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
   * Given a message as it's retrieved from the database, it queries the blob storage for the content and returns a new version of the message including it
   * @param messageFromDb a message as it's retrieved from db
   * @return either the message with it's content or a query error
   */
  const getMessageWithContent = (
    messageFromDb: RetrievedMessageWithoutContent
  ): TaskEither<ActivityResultQueryFailure, MessageWithContent> => {
    return fromQueryEither(
      () => messageModel.getContentFromBlob(blobService, messageFromDb.id),
      "messageModel.getContentFromBlob"
    ).foldTaskEither<ActivityResultQueryFailure, MessageWithContent>(
      failure => fromEither(left(failure)),
      maybeContent =>
        fromEither<ActivityResultQueryFailure, MessageContent>(
          fromOption(
            ActivityResultQueryFailure.encode({
              kind: "QUERY_FAILURE",
              query: "messageModel.getContentFromBlob",
              reason: `Cannot find content for message ${messageFromDb.id}`
            })
          )(maybeContent)
        ).map<MessageWithContent>((content: MessageContent) =>
          appendContentToMessage(messageFromDb, content)
        )
    );
  };

  /**
   * Utility that performs enrichMessage over a list of messages
   * @param messages a list of messages without content
   * @returns either a list of message with content or a query error
   */
  const getAllMessagesWithContent = (
    messages: readonly RetrievedMessageWithoutContent[]
  ): TaskEither<
    ActivityResultQueryFailure,
    ReadonlyArray<MessageWithContent>
  > => {
    if (messages.length) {
      // this spread is needed as typescript wouldn't recognize messages[0] to be defined otherwise
      const [firstMessage, ...otherMessages] = messages;
      return sequenceT(taskEither)(
        getMessageWithContent(firstMessage),
        ...otherMessages.map(getMessageWithContent)
      );
    }
    return taskEither.of([]);
  };

  /**
   * Given a list of messages, it queires for relative notifications
   * @param messages
   */
  const findNotificationsForAllMessages = (
    messages: readonly RetrievedMessageWithoutContent[]
  ): TaskEither<
    ActivityResultQueryFailure,
    ReadonlyArray<RetrievedNotification>
  > => {
    if (messages.length) {
      // this spread is needed as typescript wouldn't recognize messages[0] to be defined otherwise
      const [firstMessage, ...otherMessages] = messages;

      return sequenceT(taskEither)(
        fromQueryEither<ReadonlyArray<RetrievedNotification>>(
          () =>
            iteratorToArray(
              notificationModel.findNotificationsForMessage(firstMessage.id)
            ),
          "findNotificationsForRecipient"
        ),
        ...otherMessages.map(m =>
          fromQueryEither<ReadonlyArray<RetrievedNotification>>(
            () =>
              iteratorToArray(
                notificationModel.findNotificationsForMessage(m.id)
              ),
            "findNotificationsForRecipient"
          )
        )
      ).foldTaskEither(
        e => fromEither(left(e)),
        arrayOfArray =>
          fromEither(
            right(
              arrayOfArray.reduce(
                /* flatten */ (flat, elem) => [...flat, ...elem],
                []
              )
            )
          )
      );
    }
    return taskEither.of([]);
  };

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
      // step 1: get messages and sender services, which can be queried by only knowing the fiscal code
      .chain(profile =>
        sequenceS(taskEither)({
          // queries all messages for the user
          messages: fromQueryEither<ReadonlyArray<RetrievedMessageWithContent>>(
            () => iteratorToArray(messageModel.findMessages(fiscalCode)),
            "findMessages"
          ),
          profile: taskEither.of(profile),
          // queries all services that sent a message to the user
          senderServices: fromQueryEither<ReadonlyArray<SenderService>>(
            () =>
              iteratorToArray(
                senderServiceModel.findSenderServicesForRecipient(fiscalCode)
              ),
            "findSenderServicesForRecipient"
          ).map(retrievedDocs => retrievedDocs.map(fromRetrievedDbDocument))
        })
      )
      // step 2: queries notifications and message contents, which need message data to be queried first
      .chain(({ profile, messages, senderServices }) => {
        // tslint:disable-next-line: no-any
        const asRetrievedMessages = (messages as any) as readonly RetrievedMessageWithoutContent[]; // this cast is needed because messageModel.findMessages is erroneously marked as RetrievedMessageWithContent, although content isn't included
        const allData: TaskEither<
          ActivityResultUserNotFound | ActivityResultQueryFailure,
          AllUserData
          // tslint:disable-next-line: prefer-immediate-return
        > = sequenceS(taskEither)({
          messages: getAllMessagesWithContent(asRetrievedMessages),
          notifications: findNotificationsForAllMessages(
            asRetrievedMessages
          ).map(retrievedDocs => retrievedDocs.map(fromRetrievedDbDocument)),
          profile: taskEither.of(profile),
          senderServices: taskEither.of(senderServices)
        });
        return allData;
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
