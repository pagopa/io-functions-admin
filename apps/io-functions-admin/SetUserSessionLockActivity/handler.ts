/**
 * Interacts with Session API to lock/unlock user
 */

import { Context } from "@azure/functions";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";

import { Client } from "../utils/sm-internal/client";
import { SuccessResponse } from "../utils/sm-internal/SuccessResponse";

const assertNever = (_: never): never => {
  throw new Error("should not have executed this");
};

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
 *
 * @param sessionApiClient
 * @param action
 * @param fiscalCode
 */
const callSessionApi = (
  context: Context,
  sessionApiClient: Client<"ApiKeyAuth">,
  action: ActivityInput["action"],
  fiscalCode: FiscalCode
): TE.TaskEither<ApiCallFailure | BadApiRequestFailure, SuccessResponse> =>
  pipe(
    TE.tryCatch(
      () => {
        switch (action) {
          case "LOCK":
            return sessionApiClient.lockUserSession({ fiscalCode });
          case "UNLOCK":
            return sessionApiClient.unlockUserSession({
              fiscalCode
            });
          default:
            return assertNever(action);
        }
      },
      error => {
        context.log.error(`${logPrefix}|ERROR|failed using api`, action, error);
        return ApiCallFailure.encode({
          kind: "API_CALL_FAILURE",
          reason: toError(error).message
        });
      }
    ),
    TE.chain(
      flow(
        TE.fromEither,
        TE.mapLeft(error => {
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
    ),
    TE.chain(({ status, value }) => {
      switch (status) {
        case 200:
          return TE.of(value);
        case 400:
        case 401:
        case 404:
          context.log.error(
            `${logPrefix}|ERROR|API bad request ${status}`,
            action,
            value
          );
          return TE.left<
            ApiCallFailure | BadApiRequestFailure,
            SuccessResponse
          >(
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
          return TE.left<
            ApiCallFailure | BadApiRequestFailure,
            SuccessResponse
          >(
            ApiCallFailure.encode({
              kind: "API_CALL_FAILURE",
              reason: `Session Api unexpected error, action: ${action}`
            })
          );
        default:
          return assertNever(status);
      }
    })
  );

export const createSetUserSessionLockActivityHandler =
  (sessionApiClient: Client<"ApiKeyAuth">) =>
  (context: Context, input: unknown) =>
    pipe(
      input,
      ActivityInput.decode,
      TE.fromEither,
      TE.mapLeft(err =>
        InvalidInputFailure.encode({
          kind: "INVALID_INPUT_FAILURE",
          reason: readableReport(err)
        })
      ),
      TE.chainW(({ action, fiscalCode }) =>
        callSessionApi(context, sessionApiClient, action, fiscalCode)
      ),
      TE.mapLeft(failure => {
        context.log.error(`${logPrefix}|ERROR|Activity failed`, failure);
        // in case of transient failures we let the activity throw, so the orchestrator can retry
        if (TransientFailure.is(failure)) {
          throw failure;
        }
        return failure;
      }),
      TE.map(_ => {
        context.log.info(`${logPrefix}|INFO|Activity succeeded`);
        return ActivityResultSuccess.encode({ kind: "SUCCESS" });
      }),
      TE.toUnion
    )();
