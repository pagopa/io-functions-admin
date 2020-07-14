/**
 * Interacts with Session API to lock/unlock user
 */

import { fromEither, taskEither } from "fp-ts/lib/TaskEither";

import { Context } from "@azure/functions";

import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  ActivityInput,
  ActivityResultSuccess,
  InvalidInputFailure
} from "./types";

const logPrefix = `SetUserSessionLockActivity`;

export const createSetUserSessionLockActivityHandler = () => (
  context: Context,
  input: unknown
) =>
  fromEither(ActivityInput.decode(input))
    .mapLeft(err =>
      InvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(err)
      })
    )
    .chain(_ => {
      // TODO: execute call to session api
      return taskEither.of(_);
    })
    .map(_ => ActivityResultSuccess.encode({ kind: "SUCCESS" }))
    .run()
    .then(e => e.value);
