/**
 * This activity extracts all the data about a user contained in our db.
 */

import { Context } from "@azure/functions";
import { NotificationChannelEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import {
  MessageModel,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MessageStatus,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageViewModel } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { RetrievedNotification } from "@pagopa/io-functions-commons/dist/src/models/notification";
import { NotificationModel } from "@pagopa/io-functions-commons/dist/src/models/notification";
import {
  NotificationStatus,
  NotificationStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/notification_status";
import {
  Profile,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { DeferredPromise } from "@pagopa/ts-commons/lib/promises";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { sequenceS, sequenceT } from "fp-ts/lib/Apply";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as ROA from "fp-ts/lib/ReadonlyArray";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import * as stream from "stream";
import * as yaml from "yaml";

import { getMessageFromCosmosErrors } from "../utils/conversions";
import { ServicePreferencesDeletableModel } from "../utils/extensions/models/service_preferences";
import { generateStrongPassword, StrongPassword } from "../utils/random";
import { AllUserData, MessageContentWithId } from "../utils/userData";
import { getEncryptedZipStream } from "../utils/zip";

export const ArchiveInfo = t.interface({
  blobName: NonEmptyString,
  password: StrongPassword
});
export type ArchiveInfo = t.TypeOf<typeof ArchiveInfo>;

// Activity input
export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity success result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: ArchiveInfo
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
type ActivityResultUserNotFound = t.TypeOf<typeof ActivityResultUserNotFound>;

// activity failed for user not found
const ActivityResultArchiveGenerationFailure = t.interface({
  kind: t.literal("ARCHIVE_GENERATION_FAILURE"),
  reason: t.string
});

export type ActivityResultArchiveGenerationFailure = t.TypeOf<
  typeof ActivityResultArchiveGenerationFailure
>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  ActivityResultUserNotFound,
  ActivityResultQueryFailure,
  ActivityResultInvalidInputFailure,
  ActivityResultArchiveGenerationFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `ExtractUserDataActivity`;

/**
 * Converts a Promise<Either<L, R>> that can reject
 * into a TaskEither<Error | L, R>
 */
const fromPromiseEither = <L, R>(
  promise: Promise<E.Either<L, R>>
): TE.TaskEither<Error | L, R> =>
  pipe(
    TE.tryCatch(() => promise, E.toError),
    TE.chainW(TE.fromEither)
  );

/**
 * To be used for exhaustive checks
 */

function assertNever(_: never): void {
  throw new Error("should not have executed this");
}

/**
 * Logs depending on failure type
 *
 * @param context the Azure functions context
 * @param failure the failure to log
 */
const logFailure =
  (context: Context) =>
  (failure: ActivityResultFailure): void => {
    switch (failure.kind) {
      case "ARCHIVE_GENERATION_FAILURE":
        context.log.error(
          `${logPrefix}|Error saving zip bundle|ERROR=${failure.reason}`
        );
        break;
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
      case "USER_NOT_FOUND_FAILURE":
        context.log.error(`${logPrefix}|Error user not found|ERROR=`);
        break;
      default:
        assertNever(failure);
    }
  };

/**
 * Look for a profile from a given fiscal code
 *
 * @param fiscalCode a fiscal code identifying the user
 * @returns either a user profile, a query error or a user-not-found error
 */
export const getProfile = (
  profileModel: ProfileModel,
  fiscalCode: FiscalCode
): TE.TaskEither<
  ActivityResultQueryFailure | ActivityResultUserNotFound,
  Profile
> =>
  pipe(
    profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(failure =>
      ActivityResultQueryFailure.encode({
        kind: "QUERY_FAILURE",
        reason: `${failure.kind}, ${getMessageFromCosmosErrors(failure)}`
      })
    ),
    TE.chainW(
      TE.fromOption(() =>
        ActivityResultUserNotFound.encode({
          kind: "USER_NOT_FOUND_FAILURE"
        })
      )
    )
  );
/**
 * Retrieves all contents for provided messages
 */
export const getAllMessageContents = (
  messageContentBlobService: BlobService,
  messageModel: MessageModel,
  messages: readonly RetrievedMessageWithoutContent[]
): TE.TaskEither<ActivityResultQueryFailure, readonly MessageContentWithId[]> =>
  pipe(
    messages,
    ROA.map(_ => _.id),
    ROA.map(messageId =>
      pipe(
        messageModel.getContentFromBlob(messageContentBlobService, messageId),
        TE.chainW(
          flow(
            TE.fromOption(() => void 0 /* anything will do */),
            TE.map(content => ({
              content,
              messageId
            }))
          )
        ),
        TE.fold(
          // in case of failure retrieving the single message, just live a placeholder
          () => TE.of({ messageId } as MessageContentWithId),
          TE.of
        )
      )
    ),
    ROA.sequence(TE.ApplicativePar)
  );

/**
 * Retrieves all statuses for provided messages
 */
export const getAllMessagesStatuses = (
  messageStatusModel: MessageStatusModel,
  messages: readonly RetrievedMessageWithoutContent[]
): TE.TaskEither<ActivityResultQueryFailure, readonly MessageStatus[]> =>
  pipe(
    messages,
    ROA.map(_ => _.id),
    ROA.map(messageId =>
      pipe(
        messageStatusModel.findLastVersionByModelId([messageId]),
        TE.mapLeft(failure =>
          ActivityResultQueryFailure.encode({
            kind: "QUERY_FAILURE",
            reason: `messageStatusModel|${
              failure.kind
            }, ${getMessageFromCosmosErrors(failure)}`
          })
        ),
        TE.chainW(TE.fromOption(() => void 0 /* anything will do */)),
        TE.fold(
          // in case of failure retrieving the single message, just live a placeholder
          () => TE.of({ messageId } as MessageStatus),
          TE.of
        )
      )
    ),
    ROA.sequence(TE.ApplicativePar)
  );

/**
 * Given a list of messages, get the relative notifications
 *
 * @param messages
 */
export const findNotificationsForAllMessages = (
  notificationModel: NotificationModel,
  messages: readonly RetrievedMessageWithoutContent[]
): TE.TaskEither<
  ActivityResultQueryFailure,
  readonly RetrievedNotification[]
> =>
  pipe(
    messages,
    ROA.map(m => notificationModel.findNotificationForMessage(m.id)),
    ROA.sequence(TE.ApplicativeSeq),
    TE.mapLeft(e =>
      ActivityResultQueryFailure.encode({
        kind: "QUERY_FAILURE",
        reason: `notificationModel.findNotificationForMessage| ${
          e.kind
        }, ${getMessageFromCosmosErrors(e)}`
      })
    ),
    // There are cases in which a message has no notification and that's fine
    // We just filter "none" elements
    TE.map(
      flow(
        ROA.filter(O.isSome),
        ROA.map(maybeNotification => maybeNotification.value)
      )
    )
  );

export const findAllNotificationStatuses = (
  notificationStatusModel: NotificationStatusModel,
  notifications: readonly RetrievedNotification[]
): TE.TaskEither<ActivityResultQueryFailure, readonly NotificationStatus[]> =>
  pipe(
    notifications,

    // compose a query for every supported channel type
    ROA.reduce(
      [] as readonly (readonly [NonEmptyString, NotificationChannelEnum])[],
      (queries, { id: notificationId }) => [
        ...queries,
        ...Object.values(NotificationChannelEnum).map(
          channel => [notificationId, channel] as const
        )
      ]
    ),
    ROA.map(([notificationId, channel]) =>
      pipe(
        notificationStatusModel.findOneNotificationStatusByNotificationChannel(
          notificationId,
          channel
        ),
        TE.mapLeft(e =>
          ActivityResultQueryFailure.encode({
            kind: "QUERY_FAILURE",
            reason: `notificationStatusModel.findOneNotificationStatusByNotificationChannel|${
              e.kind
            }, ${getMessageFromCosmosErrors(e)}`
          })
        )
      )
    ),
    ROA.sequence(TE.ApplicativePar),

    // filter empty results (it might not exist a content for a pair notification/channel)
    TE.map(
      flow(
        ROA.filter(O.isSome),
        ROA.map(someNotificationStatus => someNotificationStatus.value)
      )
    )
  );

/**
 * Perform all the queries to extract all data for a given user
 *
 * @param fiscalCode user identifier
 * @returns Either a failure or a hash set with all the information regarding the user
 */
export const queryAllUserData = (
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  messageViewModel: MessageViewModel,
  notificationModel: NotificationModel,
  notificationStatusModel: NotificationStatusModel,
  profileModel: ProfileModel,
  messageContentBlobService: BlobService,
  fiscalCode: FiscalCode,
  servicePreferencesModel: ServicePreferencesDeletableModel
): TE.TaskEither<
  ActivityResultQueryFailure | ActivityResultUserNotFound,
  AllUserData
> =>
  pipe(
    // step 0: look for the profile
    getProfile(profileModel, fiscalCode),
    // step 1: get messages, which can be queried by only knowing the fiscal code
    TE.chainW(profile =>
      sequenceS(TE.ApplicativePar)({
        // queries all messages for the user
        messages: pipe(
          messageModel.findMessages(fiscalCode),
          TE.chainW(iterator =>
            TE.tryCatch(
              () => asyncIteratorToArray(iterator),
              toCosmosErrorResponse
            )
          ),
          TE.map(ROA.flatten),
          TE.mapLeft(_ =>
            ActivityResultQueryFailure.encode({
              kind: "QUERY_FAILURE",
              query: "findMessages",
              reason: `${_.kind}, ${getMessageFromCosmosErrors(_)}`
            })
          ),
          TE.chainW(results =>
            results.some(E.isLeft)
              ? TE.left(
                  ActivityResultQueryFailure.encode({
                    kind: "QUERY_FAILURE",
                    query: "findMessages",
                    reason: "Some messages cannot be decoded"
                  })
                )
              : TE.of(
                  ROA.rights(
                    results
                  ) as readonly RetrievedMessageWithoutContent[]
                )
          )
        ),
        messagesView: pipe(
          messageViewModel
            .getQueryIterator({
              parameters: [
                {
                  name: "@fiscalCode",
                  value: fiscalCode
                }
              ],
              query: `SELECT * FROM m WHERE m.fiscalCode = @fiscalCode
                    ORDER BY m.fiscalCode, m.id DESC`
            })
            [Symbol.asyncIterator](),
          TE.of,
          TE.chain(iter =>
            TE.tryCatch(() => asyncIteratorToArray(iter), toCosmosErrorResponse)
          ),
          TE.map(ROA.flatten),
          TE.mapLeft(_ =>
            ActivityResultQueryFailure.encode({
              kind: "QUERY_FAILURE",
              query: "findMessagesView",
              reason: `${_.kind}, ${getMessageFromCosmosErrors(_)}`
            })
          ),
          TE.chainW(results =>
            results.some(E.isLeft)
              ? TE.left(
                  ActivityResultQueryFailure.encode({
                    kind: "QUERY_FAILURE",
                    query: "findMessagesView",
                    reason: "Some messages cannot be decoded"
                  })
                )
              : TE.of(ROA.rights(results))
          )
        ),
        profile: TE.of(profile),
        servicesPreferences: pipe(
          servicePreferencesModel.findAllByFiscalCode(fiscalCode),
          flattenAsyncIterator,
          asyncIteratorToArray,
          promise =>
            TE.tryCatch(
              () => promise,
              () =>
                ActivityResultQueryFailure.encode({
                  kind: "QUERY_FAILURE",
                  reason: "Error with the async operator"
                })
            ),
          // ROA.rights will return only the right values obtained from the database
          // (left values represent malformed data inside the database)
          TE.map(ROA.rights)
        )
      })
    ),
    // step 2: queries notifications and message contents, which need message data to be queried first
    TE.chainW(({ messages, messagesView, profile, servicesPreferences }) =>
      sequenceS(TE.ApplicativePar)({
        messageContents: getAllMessageContents(
          messageContentBlobService,
          messageModel,
          messages
        ),
        messages: TE.of(messages),
        messageStatuses: getAllMessagesStatuses(messageStatusModel, messages),
        messagesView: TE.of(messagesView),
        notifications: findNotificationsForAllMessages(
          notificationModel,
          messages
        ),
        profile: TE.of(profile),
        servicesPreferences: TE.of(servicesPreferences)
      })
    ),
    // step 3: queries notifications statuses
    TE.bindW("notificationStatuses", ({ notifications }) =>
      findAllNotificationStatuses(notificationStatusModel, notifications)
    ),
    TE.map(
      ({
        messageContents,
        messages,
        messageStatuses,
        messagesView,
        notifications,
        notificationStatuses,
        profile,
        servicesPreferences
      }) => ({
        messageContents,
        messages,
        messageStatuses,
        messagesView,
        notifications,
        notificationStatuses,
        profiles: [profile],
        servicesPreferences
      })
    )
  );

const getCreateWriteStreamToBlockBlob =
  (blobService: BlobService) => (container: string, blob: string) => {
    const { e1: errorOrResult, e2: resolve } =
      DeferredPromise<E.Either<Error, BlobService.BlobResult>>();
    const blobStream = blobService.createWriteStreamToBlockBlob(
      container,
      blob,
      { contentSettings: { contentType: "application/zip" } },
      (err, result) => (err ? resolve(E.left(err)) : resolve(E.right(result)))
    );

    return { blobStream, errorOrResult };
  };

const onStreamFinished = TE.taskify(stream.finished);

/**
 * Creates a bundle with all user data and save it to a blob on a remote storage
 *
 * @param data all extracted user data
 * @param password a password for bundle encryption
 *
 * @returns either a failure or an object with the name of the blob and the password
 */
export const saveDataToBlob = (
  blobService: BlobService,
  userDataContainerName: string,
  data: AllUserData,
  password: StrongPassword
): TE.TaskEither<ActivityResultArchiveGenerationFailure, ArchiveInfo> => {
  const profile = data.profiles[0];
  const blobName = `${profile.fiscalCode}-${Date.now()}.zip` as NonEmptyString;
  const fileName = `${profile.fiscalCode}.yaml` as NonEmptyString;

  const zipStream = getEncryptedZipStream(password);

  const failure = (err: Error) =>
    ActivityResultArchiveGenerationFailure.encode({
      kind: "ARCHIVE_GENERATION_FAILURE",
      reason: err.message
    });

  const success = () =>
    ArchiveInfo.encode({
      blobName,
      password
    });

  const { blobStream, errorOrResult } = getCreateWriteStreamToBlockBlob(
    blobService
  )(userDataContainerName, blobName);

  zipStream.pipe(blobStream);
  zipStream.append(yaml.stringify(data), {
    name: fileName
  });

  const onZipStreamError = pipe(
    onStreamFinished(zipStream),
    TE.mapLeft(failure)
  );

  const onZipStreamFinalized = pipe(
    TE.tryCatch(() => zipStream.finalize(), E.toError),
    TE.mapLeft(failure)
  );

  // This task will run only when `onZipStreamFinalized` completes.
  // If `onZipStreamFinalized` does not finish, the process hangs here
  // until the function runtime timeout is reached
  const onBlobStreamWritten = pipe(
    fromPromiseEither(errorOrResult),
    TE.bimap(failure, success)
  );

  // run tasks in parallel
  return pipe(
    sequenceT(TE.ApplicativePar)(
      onZipStreamError,
      onZipStreamFinalized,
      onBlobStreamWritten
    ),
    TE.map(([, , blobStreamResult]) => blobStreamResult)
  );
};

export interface IActivityHandlerInput {
  readonly messageContentBlobService: BlobService;
  readonly messageModel: MessageModel;
  readonly messageStatusModel: MessageStatusModel;
  readonly messageViewModel: MessageViewModel;
  readonly notificationModel: NotificationModel;
  readonly notificationStatusModel: NotificationStatusModel;
  readonly profileModel: ProfileModel;
  readonly servicePreferencesModel: ServicePreferencesDeletableModel;
  readonly userDataBlobService: BlobService;
  readonly userDataContainerName: NonEmptyString;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cleanData = (v: any) => {
  const { _attachments, _etag, _rid, _self, _ts, ...clean } = v;
  return clean;
};

/**
 * Factory methods that builds an activity function
 */

export function createExtractUserDataActivityHandler({
  messageContentBlobService,
  messageModel,
  messageStatusModel,
  messageViewModel,
  notificationModel,
  notificationStatusModel,
  profileModel,
  servicePreferencesModel,
  userDataBlobService,
  userDataContainerName
}: IActivityHandlerInput): (
  context: Context,
  input: unknown
) => Promise<ActivityResult> {
  return (context: Context, input: unknown) =>
    pipe(
      input,
      ActivityInput.decode,
      E.mapLeft(reason =>
        ActivityResultInvalidInputFailure.encode({
          kind: "INVALID_INPUT_FAILURE",
          reason: readableReport(reason)
        })
      ),
      TE.fromEither,
      TE.chainW(({ fiscalCode }) =>
        queryAllUserData(
          messageModel,
          messageStatusModel,
          messageViewModel,
          notificationModel,
          notificationStatusModel,
          profileModel,
          messageContentBlobService,
          fiscalCode,
          servicePreferencesModel
        )
      ),
      TE.map(allUserData => {
        // remove sensitive data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const notifications = allUserData.notifications.map((e: any) =>
          cleanData({
            ...e,
            channels: { ...e.channels, WEBHOOK: { url: undefined } }
          })
        );
        return {
          messageContents: allUserData.messageContents,
          messages: allUserData.messages.map(cleanData),
          messageStatuses: allUserData.messageStatuses.map(cleanData),
          messagesView: allUserData.messagesView.map(cleanData),
          notifications,
          notificationStatuses: allUserData.messageStatuses.map(cleanData),
          profiles: allUserData.profiles.map(cleanData),
          servicesPreferences: allUserData.servicesPreferences.map(cleanData)
        };
      }),
      TE.chainW(allUserData =>
        saveDataToBlob(
          userDataBlobService,
          userDataContainerName,
          allUserData,
          generateStrongPassword()
        )
      ),
      TE.bimap(
        failure => {
          logFailure(context)(failure);
          return failure;
        },
        archiveInfo =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: archiveInfo
          })
      ),
      TE.toUnion
    )();
}
