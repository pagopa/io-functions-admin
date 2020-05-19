/**
 * Updates the status of a UserDataProcessing record
 */

import * as t from "io-ts";

import { Either, left, right } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { QueryError } from "documentdb";
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
      query: queryName,
      reason: err.message
    })
  ).chain((queryErrorOrRecord: Either<QueryError, R>) =>
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

export const createGetUserDataProcessingActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  /**
   * Updates a UserDataProcessing record by creating a new version of it with a chenged status
   * @param param0.currentRecord the record to be modified
   * @param param0.nextStatus: the status to assign the record to
   *
   * @returns either an Error or the new created record
   */
  const fetchRecordFromDb = ({
    fiscalCode,
    choice
  }: {
    fiscalCode: FiscalCode;
    choice: UserDataProcessingChoice;
  }): TaskEither<ActivityResultQueryFailure, Option<UserDataProcessing>> =>
    fromQueryEither(
      () =>
        userDataProcessingModel.findOneUserDataProcessingById(
          fiscalCode,
          makeUserDataProcessingId(choice, fiscalCode)
        ),
      "userDataProcessingModel.findOneUserDataProcessingById"
    );

  // the actual handler
  return fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
      ActivityResultInvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(reason)
      })
    )
    .chain(fetchRecordFromDb)
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
