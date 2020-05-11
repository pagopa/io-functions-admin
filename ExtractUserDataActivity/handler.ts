/**
 * This activity extracts all the data about a user contained in our db.
 *
 */

import * as t from "io-ts";

import { sequenceS } from "fp-ts/lib/Apply";
import { Either, fromOption, left } from "fp-ts/lib/Either";
import {
  fromEither,
  TaskEither,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { QueryError } from "documentdb";
import {
  Message,
  MessageModel
} from "io-functions-commons/dist/src/models/message";
import { Notification } from "io-functions-commons/dist/src/models/notification";
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
  messages: t.readonlyArray(Message, "MessageList"),
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
  lazyPromise: () => Promise<Either<QueryError, R>>,
  queryName: string = ""
) =>
  tryCatch(lazyPromise, (err: Error) =>
    ActivityResultQueryFailure.encode({
      kind: "QUERY_FAILURE",
      reason: err.message,
      query: queryName
    })
  ).chain((queryErrorOrRecord: Either<QueryError, R>) =>
    fromEither(
      queryErrorOrRecord.mapLeft(queryError =>
        ActivityResultQueryFailure.encode({
          kind: "QUERY_FAILURE",
          reason: JSON.stringify(queryError),
          query: queryName
        })
      )
    )
  );

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
  }
};

export const createExtractUserDataActivityHandler = (
  messageModel: MessageModel,
  notificationModel: NotificationModel,
  profileModel: ProfileModel,
  senderServiceModel: SenderServiceModel
) => (context: Context, input: unknown) => {
  /**
   * Look for a profile from a given fiscal code
   * @param fiscalCode a fiscal code identifying the user
   *
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
   * Perform all the queries to extract all data for a given user
   * @param fiscalCode user identifier
   *
   * @returns Either a failure or a hash set with all the information regarding the user
   */
  const queryAllUserData = (
    fiscalCode: FiscalCode
  ): TaskEither<
    ActivityResultUserNotFound | ActivityResultQueryFailure,
    AllUserData
  > =>
    // queries the profile
    taskifiedFindProfile(fiscalCode)
      // on profile found, queries all other data sets
      .chain(profile =>
        sequenceS(taskEither)({
          // queries all messages for the user
          messages: fromQueryEither<ReadonlyArray<Message>>(
            () => iteratorToArray(messageModel.findMessages(fiscalCode)),
            "findMessages"
          ),
          notifications: fromQueryEither<ReadonlyArray<Notification>>(
            () =>
              iteratorToArray(
                notificationModel.findNotificationsForRecipient(fiscalCode)
              ),
            "findNotificationsForRecipient"
          ),
          // just previous profile data
          profile: taskEither.of(profile),
          // queries all services that sent a message to the user
          senderServices: fromQueryEither<ReadonlyArray<SenderService>>(
            () =>
              iteratorToArray(
                senderServiceModel.findSenderServicesForRecipient(fiscalCode)
              ),
            "findSenderServicesForRecipient"
          )
        })
      );

  // the actual handler
  return fromEither(ActivityInput.decode(input))
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
