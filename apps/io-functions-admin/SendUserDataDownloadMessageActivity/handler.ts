import { Context } from "@azure/functions";
import { NewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";

import { userDataDownloadMessage } from "./messages";

/**
 * Send a single user data download message
 * using the IO Notification API (REST).
 */

async function sendMessage(
  fiscalCode: FiscalCode,
  apiUrl: string,
  apiKey: string,
  newMessage: NewMessage,
  timeoutFetch: typeof fetch
): Promise<Response> {
  return timeoutFetch(`${apiUrl}/api/v1/messages/${fiscalCode}`, {
    body: JSON.stringify(newMessage),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": apiKey
    },
    method: "POST"
  });
}

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

export const ActivityInput = t.interface({
  blobName: t.string,
  fiscalCode: FiscalCode,
  password: t.string
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getActivityFunction =
  (
    publicApiUrl: NonEmptyString,
    publicApiKey: NonEmptyString,
    publicDownloadBaseUrl: NonEmptyString,
    timeoutFetch: typeof fetch
  ) =>
  (context: Context, input: unknown): Promise<ActivityResult> => {
    const failure = (reason: string) => {
      context.log.error(reason);
      return ActivityResultFailure.encode({
        kind: "FAILURE",
        reason
      });
    };

    const success = () =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS"
      });

    return pipe(
      input,
      ActivityInput.decode,
      E.mapLeft(errs =>
        failure(
          `SendUserDataDownloadMessageActivity|Cannot decode input|ERROR=${readableReport(
            errs
          )}|INPUT=${JSON.stringify(input)}`
        )
      ),
      TE.fromEither,
      TE.chainW(({ blobName, fiscalCode, password }) => {
        const logPrefix = `SendUserDataDownloadMessageActivity|PROFILE=${fiscalCode}`;
        context.log.verbose(`${logPrefix}|Sending user data download message`);

        return TE.tryCatch(
          async () => {
            // throws in case of timeout so
            // the orchestrator can schedule a retry
            const response = await sendMessage(
              fiscalCode,
              publicApiUrl,
              publicApiKey,
              userDataDownloadMessage(
                blobName,
                password,
                publicDownloadBaseUrl
              ),
              timeoutFetch
            );

            const status = response.status;

            if (status !== 201) {
              const msg = `${logPrefix}|ERROR=${status},${await response.text()}`;
              if (status >= 500) {
                throw new Error(msg);
              } else {
                return failure(msg);
              }
            }

            context.log.verbose(`${logPrefix}|RESPONSE=${status}`);
            return success();
          },
          e => failure(E.toError(e).message)
        );
      }),
      TE.toUnion
    )();
  };

export default getActivityFunction;
