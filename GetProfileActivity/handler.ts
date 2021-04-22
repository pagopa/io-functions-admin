/**
 * Get a Profile record
 */

import * as t from "io-ts";

import { fromEither, fromLeft, taskEither } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import {
  ProfileModel,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { getMessageFromCosmosErrors } from "../utils/conversions";

// Activity input
export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: RetrievedProfile
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function assertNever(_: never): void {
  throw new Error("should not have executed this");
}

/**
 * Logs depending on failure type
 *
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
      context.log.warn(`${logPrefix}|Error Profile not found`);
      break;
    default:
      assertNever(failure);
  }
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createGetProfileActivityHandler = (profileModel: ProfileModel) => (
  context: Context,
  input: unknown
) =>
  // the actual handler
  fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
      ActivityResultInvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(reason)
      })
    )
    .chain(({ fiscalCode }) =>
      profileModel
        .findLastVersionByModelId([fiscalCode])
        .foldTaskEither<ActivityResultFailure, RetrievedProfile>(
          error =>
            fromLeft(
              ActivityResultQueryFailure.encode({
                kind: "QUERY_FAILURE",
                query: "findLastVersionByModelId",
                reason: `${error.kind}, ${getMessageFromCosmosErrors(error)}`
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
