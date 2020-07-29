/**
 * Updates the status of a UserDataProcessing record
 */

import * as t from "io-ts";

import { fromEither, fromLeft, taskEither } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { UserDataProcessingChoice } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  makeUserDataProcessingId,
  UserDataProcessing,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";

// Activity input
export const ActivityInput = t.interface({
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: UserDataProcessing
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

// Activity failed because of invalid input
export const ActivityResultInvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type ActivityResultInvalidInputFailure = t.TypeOf<
  typeof ActivityResultInvalidInputFailure
>;

// Activity failed because of invalid input
export const ActivityResultNotFoundFailure = t.interface({
  kind: t.literal("NOT_FOUND_FAILURE")
});
export type ActivityResultNotFoundFailure = t.TypeOf<
  typeof ActivityResultNotFoundFailure
>;

// Activity failed because of an error on a query
export const ActivityResultQueryFailure = t.intersection([
  t.interface({
    kind: t.literal("QUERY_FAILURE"),
    reason: t.string
  }),
  t.partial({ query: t.string })
]);
export type ActivityResultQueryFailure = t.TypeOf<
  typeof ActivityResultQueryFailure
>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  ActivityResultQueryFailure,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `GetUserDataProcessingActivity`;

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
    case "NOT_FOUND_FAILURE":
      // it might not be a failure
      context.log.warn(`${logPrefix}|Error UserDataProcessing not found`);
      break;
    default:
      assertNever(failure);
  }
};

export const createSetUserDataProcessingStatusActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
) => (context: Context, input: unknown) => {
  // the actual handler
  return fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
      ActivityResultInvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(reason)
      })
    )
    .chain(({ fiscalCode, choice }) =>
      userDataProcessingModel
        .findLastVersionByModelId(
          makeUserDataProcessingId(choice, fiscalCode),
          fiscalCode
        )
        .foldTaskEither<ActivityResultFailure, UserDataProcessing>(
          error =>
            fromLeft(
              ActivityResultQueryFailure.encode({
                kind: "QUERY_FAILURE",
                query: "findOneUserDataProcessingById",
                reason: JSON.stringify(error)
              })
            ),
          maybeRecord =>
            maybeRecord.fold(
              fromLeft(
                ActivityResultNotFoundFailure.encode({
                  kind: "NOT_FOUND_FAILURE"
                })
              ),
              _ => taskEither.of(_)
            )
        )
    )
    .map(record =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: record
      })
    )
    .mapLeft(failure => {
      logFailure(context)(failure);
      return failure;
    })
    .run()
    .then(e => e.value);
};
