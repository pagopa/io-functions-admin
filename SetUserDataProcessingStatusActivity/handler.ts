/**
 * Updates the status of a UserDataProcessing record
 */

import * as t from "io-ts";

import { Either } from "fp-ts/lib/Either";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { QueryError } from "documentdb";
import { UserDataProcessingStatus } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "italia-ts-commons/lib/reporters";

// Activity input
export const ActivityInput = t.interface({
  currentRecord: UserDataProcessing,
  nextStatus: UserDataProcessingStatus
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
  ActivityResultInvalidInputFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `SetUserDataProcessingStatusActivity`;

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
    default:
      assertNever(failure);
  }
};

export const createSetUserDataProcessingStatusActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
) => (context: Context, input: unknown) => {
  /**
   * Updates a UserDataProcessing record by creating a new version of it with a chenged status
   * @param param0.currentRecord the record to be modified
   * @param param0.nextStatus: the status to assign the record to
   *
   * @returns either an Error or the new created record
   */
  const saveNewStatusOnDb = ({
    currentRecord,
    nextStatus
  }: {
    currentRecord: UserDataProcessing;
    nextStatus: UserDataProcessingStatus;
  }): TaskEither<ActivityResultQueryFailure, UserDataProcessing> =>
    userDataProcessingModel
      .createOrUpdateByNewOne({
        ...currentRecord,
        status: nextStatus
      })
      .mapLeft(err =>
        ActivityResultQueryFailure.encode({
          kind: "QUERY_FAILURE",
          query: "userDataProcessingModel.createOrUpdateByNewOne",
          // FIXME - get a useful error's reason
          reason: err.kind
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
    .chain(saveNewStatusOnDb)
    .map(newRecord =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: newRecord
      })
    )
    .mapLeft(failure => {
      logFailure(context)(failure);
      return failure;
    })
    .run()
    .then(e => e.value);
};
