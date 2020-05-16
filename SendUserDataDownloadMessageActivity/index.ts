import { AzureFunction, Context } from "@azure/functions";

import { agent } from "italia-ts-commons";
import { readableReport } from "italia-ts-commons/lib/reporters";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { RetrievedProfile } from "io-functions-commons/dist/src/models/profile";

import { NewMessage } from "io-functions-commons/dist/generated/definitions/NewMessage";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Millisecond } from "italia-ts-commons/lib/units";

// HTTP external requests timeout in milliseconds
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Needed to call notifications API
const publicApiUrl = getRequiredStringEnv("PUBLIC_API_URL");
const publicApiKey = getRequiredStringEnv("PUBLIC_API_KEY");

// HTTP-only fetch with optional keepalive agent
// @see https://github.com/pagopa/io-ts-commons/blob/master/src/agent.ts#L10
const httpApiFetch = agent.getHttpFetch(process.env);

// a fetch that can be aborted and that gets cancelled after fetchTimeoutMs
const abortableFetch = AbortableFetch(httpApiFetch);
const timeoutFetch = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);

// TODO: switch text based on user's preferred_language
const userDataDownloadMessage = (_: RetrievedProfile): NewMessage =>
  NewMessage.decode({
    content: {
      markdown: ``,
      subject: ``
    }
  }).getOrElseL(errs => {
    throw new Error("Invalid message: " + readableReport(errs));
  });

/**
 * Send a message to the user that requested its own data;
 * the message contains a link to the encrypted zip and the password.
 */
async function sendUserDataDownloadMessage(
  fiscalCode: FiscalCode,
  apiUrl: string,
  apiKey: string,
  newMessage: NewMessage
): Promise<number> {
  const response = await timeoutFetch(
    `${apiUrl}/api/v1/messages/${fiscalCode}`,
    {
      body: JSON.stringify(newMessage),
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": apiKey
      },
      method: "POST"
    }
  );
  return response.status;
}

const activityFunction: AzureFunction = async (
  context: Context,
  input: {
    profile: RetrievedProfile;
  }
): Promise<string> => {
  const profileOrError = RetrievedProfile.decode(input.profile);

  if (profileOrError.isLeft()) {
    context.log.error(
      `SendUserDataDownloadMessageActivity|Cannot decode input profile|ERROR=${readableReport(
        profileOrError.value
      )}|INPUT=${JSON.stringify(input.profile)}`
    );
    return "FAILURE";
  }

  const profile = profileOrError.value;

  const logPrefix = `SendUserDataDownloadMessageActivity|PROFILE=${profile.fiscalCode}|VERSION=${profile.version}`;

  context.log.verbose(`${logPrefix}|Sending download message`);

  const result = await sendUserDataDownloadMessage(
    profile.fiscalCode,
    publicApiUrl,
    publicApiKey,
    userDataDownloadMessage(profile)
  );

  context.log.verbose(`${logPrefix}|RESPONSES=${result}`);

  return "SUCCESS";
};

export default activityFunction;
