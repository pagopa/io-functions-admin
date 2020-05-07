/**
 * This activity creates a ValidationToken entity in a table storage.
 *
 * The validation process use a `id and validator` strategy.
 *
 * The `id` is generated using an ulid generator and is used when searching
 * a specific ValidationToken entity in the table storage.
 *
 * For the `validator` we use a random-bytes generator. This `validator` value is
 * hashed using the `sha256` strategy and then stored in the entity as `validatorHash`
 *
 * Each token has also a `InvalidAfter` field to set the token lifetime.
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
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: UserDataProcessing
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `SetUserDataProcessingStatusActivity`;

export const createSetUserDataProcessingStatusActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
) => (context: Context, input: unknown) => {
  /**
   * Logs a decoding error and convert it to a native Error
   * @param reason a description of the decoding error
   *
   * @returns an instance of Error with a custom message
   */
  const decodingErrorToSimpleError = (reason: t.Errors) => {
    context.log.error(
      `${logPrefix}|Error decoding input|ERROR=${readableReport(reason)}`
    );
    return new Error("Error decoding input");
  };

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
  }): TaskEither<Error, UserDataProcessing> =>
    tryCatch(
      () =>
        userDataProcessingModel.createOrUpdateByNewOne({
          ...currentRecord,
          status: nextStatus
        }),
      (err: Error) => {
        context.log.error(
          `${logPrefix}|Error saveNewStatusOnDb generic error |ERROR=${err.message}`
        );
        return err;
      }
    ).chain((queryErrorOrRecord: Either<QueryError, UserDataProcessing>) =>
      fromEither(
        queryErrorOrRecord.mapLeft(queryError => {
          context.log.error(
            `${logPrefix}|Error saveNewStatusOnDb query error |ERROR=${JSON.stringify(
              queryError
            )}`
          );
          return new Error(queryError.body);
        })
      )
    );

  // the actual handler
  return fromEither(ActivityInput.decode(input))
    .mapLeft(decodingErrorToSimpleError)
    .chain(saveNewStatusOnDb)
    .map(newRecord =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: newRecord
      })
    )
    .mapLeft(savingError =>
      ActivityResultFailure.encode({
        kind: "FAILURE",
        reason: savingError.message
      })
    )
    .run();
};
