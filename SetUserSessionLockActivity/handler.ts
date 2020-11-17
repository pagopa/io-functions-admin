/**
 * Interacts with Session API to lock/unlock user
 */

import { Context } from "@azure/functions";
import { toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromLeft,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { SuccessResponse } from "../generated/session-api/SuccessResponse";
import { Client } from "../utils/sessionApiClient";

function assertNever(_: never): void {
  throw new Error("should not have executed this");
}

// Activity input
export const ActivityInput = t.interface({
  action: t.union([t.literal("LOCK"), t.literal("UNLOCK")]),
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

// Activity failed because of invalid input
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;

// Activity failed because of an error on an api call
export const ApiCallFailure = t.interface({
  kind: t.literal("API_CALL_FAILURE"),
  reason: t.string
});
export type ApiCallFailure = t.TypeOf<typeof ApiCallFailure>;

// Activity failed because the api has been called badly
export const BadApiRequestFailure = t.interface({
  kind: t.literal("BAD_API_REQUEST_FAILURE"),
  reason: t.string
});
export type BadApiRequestFailure = t.TypeOf<typeof BadApiRequestFailure>;

// maps domain errors that are considered transient and thus may allow a retry
export const TransientFailure = ApiCallFailure;
export type TransientFailure = t.TypeOf<typeof TransientFailure>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  ApiCallFailure,
  BadApiRequestFailure,
  InvalidInputFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

const logPrefix = `SetUserSessionLockActivity`;

/**
 * Wraps the logic to call Session API and lift errors to the correct domain values
 * @param sessionApiClient
 * @param action
 * @param fiscalCode
 */
const callSessionApi = (
  context: Context,
  sessionApiClient: Client<"token">,
  action: ActivityInput["action"],
  fiscalcode: FiscalCode
): TaskEither<ApiCallFailure | BadApiRequestFailure, SuccessResponse> =>
  taskEither
    .of<ApiCallFailure | BadApiRequestFailure, void>(void 0)
    .chain(_ =>
      tryCatch(
        () => {
          switch (action) {
            case "LOCK":
              return sessionApiClient.lockUserSession({ fiscalcode });
            case "UNLOCK":
              return sessionApiClient.unlockUserSession({ fiscalcode });
            default:
              assertNever(action);
          }
        },
        error => {
          context.log.error(
            `${logPrefix}|ERROR|failed using api`,
            action,
            error
          );
          return ApiCallFailure.encode({
            kind: "API_CALL_FAILURE",
            reason: toError(error).message
          });
        }
      )
    )
    .chain(decodeErrorOrResponse =>
      fromEither(decodeErrorOrResponse).mapLeft(error => {
        context.log.error(
          `${logPrefix}|ERROR|failed decoding api payload`,
          action,
          error
        );
        return ApiCallFailure.encode({
          kind: "API_CALL_FAILURE",
          reason: readableReport(error)
        });
      })
    )
    .chain(({ status, value }) => {
      switch (status) {
        case 200:
          return taskEither.of(value);
        case 400:
        case 401:
        case 404:
          context.log.error(
            `${logPrefix}|ERROR|API bad request ${status}`,
            action,
            value
          );
          return fromLeft(
            BadApiRequestFailure.encode({
              kind: "BAD_API_REQUEST_FAILURE",
              reason: `Session Api called badly, action: ${action} code: ${status}`
            })
          );
        case 500:
          context.log.error(
            `${logPrefix}|ERROR|API error response ${status}`,
            action,
            value
          );
          return fromLeft(
            ApiCallFailure.encode({
              kind: "API_CALL_FAILURE",
              reason: `Session Api unexpected error, action: ${action}`
            })
          );
        default:
          assertNever(status);
      }
    });

export const createSetUserSessionLockActivityHandler = (
  sessionApiClient: Client<"token">
) => (context: Context, input: unknown) =>
  taskEither
    .of<ActivityResultFailure, void>(void 0)
    .chain(_ =>
      fromEither(ActivityInput.decode(input)).mapLeft(err =>
        InvalidInputFailure.encode({
          kind: "INVALID_INPUT_FAILURE",
          reason: readableReport(err)
        })
      )
    )
    .chain(({ action, fiscalCode }) =>
      callSessionApi(context, sessionApiClient, action, fiscalCode)
    )
    .fold<ActivityResult>(
      failure => {
        context.log.error(`${logPrefix}|ERROR|Activity failed`, failure);

        // in case of transient failures we let the activity throw, so the orchestrator can retry
        if (TransientFailure.is(failure)) {
          throw failure;
        }
        return failure;
      },
      _ => {
        context.log.info(`${logPrefix}|INFO|Activity succeeded`);
        return ActivityResultSuccess.encode({ kind: "SUCCESS" });
      }
    )
    .run();
