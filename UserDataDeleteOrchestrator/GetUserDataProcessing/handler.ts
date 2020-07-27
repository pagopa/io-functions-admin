/**
 * Updates the status of a UserDataProcessing record
 */

import * as t from "io-ts";

import { Either, left, right } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { fromEither, TaskEither } from "fp-ts/lib/TaskEither";

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
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: UserDataProcessing
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

// Activity failed because of record not found
const ActivityResultRecordNotFound = t.interface({
  kind: t.literal("RECORD_NOT_FOUND")
});
export type ActivityResultRecordNotFound = t.TypeOf<
  typeof ActivityResultRecordNotFound
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

export const ActivityResultFailure = t.taggedUnion("kind", [
  ActivityResultQueryFailure,
  ActivityResultInvalidInputFailure,
  ActivityResultRecordNotFound
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
    case "RECORD_NOT_FOUND":
      context.log.error(`${logPrefix}|Error record not found |ERROR=`);
      break;
    default:
      assertNever(failure);
  }
};

/**
 * Updates a UserDataProcessing record by creating a new version of it with a chenged status
 * @param param0.currentRecord the record to be modified
 * @param param0.nextStatus: the status to assign the record to
 *
 * @returns either an Error or the new created record
 */
const getUserDataProcessingRequest = ({
  userDataProcessingModel,
  fiscalCode,
  choice
}: {
  userDataProcessingModel: UserDataProcessingModel;
  fiscalCode: FiscalCode;
  choice: UserDataProcessingChoice;
}): TaskEither<ActivityResultQueryFailure, Option<UserDataProcessing>> =>
  userDataProcessingModel
    .findLastVersionByModelId(
      makeUserDataProcessingId(choice, fiscalCode),
      fiscalCode
    )
    .mapLeft(err =>
      ActivityResultQueryFailure.encode({
        kind: "QUERY_FAILURE",
        query: "userDataProcessingModel.findOneUserDataProcessingById",
        // FIXME - get a useful reason from CosmosErrors
        reason: err.kind
      })
    );

export const createGetUserDataProcessingHandler = (
  userDataProcessingModel: UserDataProcessingModel
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  // the actual handler
  return fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
      ActivityResultInvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(reason)
      })
    )
    .chain(({ fiscalCode, choice }) =>
      getUserDataProcessingRequest({
        choice,
        fiscalCode,
        userDataProcessingModel
      })
    )
    .foldTaskEither(
      e => fromEither(left(e)),
      maybeRecord =>
        maybeRecord.fold(
          fromEither(
            left(
              ActivityResultRecordNotFound.encode({ kind: "RECORD_NOT_FOUND" })
            )
          ),
          foundRecord =>
            fromEither(
              right(
                ActivityResultSuccess.encode({
                  kind: "SUCCESS",
                  value: foundRecord
                })
              )
            )
        )
    )
    .mapLeft(failure => {
      logFailure(context)(failure);
      return failure;
    })
    .run()
    .then((e: Either<ActivityResultFailure, ActivityResultSuccess>) => e.value);
};
