/**
 * Updates the status of a UserDataProcessing record
 */

import * as t from "io-ts";

import { fromEither, TaskEither } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { UserDataProcessingStatus } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { getMessageFromCosmosErrors } from "../utils/conversions";

// Activity input
export const ActivityInput = t.interface({
  currentRecord: UserDataProcessing,
  nextStatus: UserDataProcessingStatus
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
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
    default:
      assertNever(failure);
  }
};

export const createSetUserDataProcessingStatusActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) => (context: Context, input: unknown) => {
  /**
   * Updates a UserDataProcessing record by creating a new version of it with a chenged status
   *
   * @param param0.currentRecord the record to be modified
   * @param param0.nextStatus: the status to assign the record to
   *
   * @returns either an Error or the new created record
   */
  const saveNewStatusOnDb = ({
    currentRecord,
    nextStatus
  }: {
    readonly currentRecord: UserDataProcessing;
    readonly nextStatus: UserDataProcessingStatus;
  }): TaskEither<ActivityResultQueryFailure, UserDataProcessing> =>
    userDataProcessingModel
      .createOrUpdateByNewOne({
        ...currentRecord,
        status: nextStatus,
        updatedAt: new Date()
      })
      .mapLeft(err =>
        ActivityResultQueryFailure.encode({
          kind: "QUERY_FAILURE",
          query: "userDataProcessingModel.createOrUpdateByNewOne",
          reason: `${err.kind}, ${getMessageFromCosmosErrors(err)}`
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
    .map(_ =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS"
      })
    )
    .mapLeft(failure => {
      logFailure(context)(failure);
      return failure;
    })
    .run()
    .then(e => e.value);
};
