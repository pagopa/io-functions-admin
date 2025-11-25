/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import { EmailAddress } from "@pagopa/io-functions-commons/dist/generated/definitions/EmailAddress";
// imported all /mailer/transports instead of /mailer to allow spyOn() to work
// https://stackoverflow.com/questions/53162001/typeerror-during-jests-spyon-cannot-set-property-getrequest-of-object-which
import * as mail from "@pagopa/io-functions-commons/dist/src/mailer/transports";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as TE from "fp-ts/lib/TaskEither";
import * as HtmlToText from "html-to-text";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityInput, getActivityFunction } from "../handler";

beforeEach(() => vi.clearAllMocks());

const mockContext = {
  log: {
    error: console.error,

    info: console.log,

    verbose: console.log,

    warn: console.warn
  }
} as any;

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

const MAIL_FROM =
  "IO - l’app dei servizi pubblici <no-reply@io.italia.it>" as NonEmptyString;
const defaultNotificationParams = {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
};

const input: ActivityInput = {
  fiscalCode: "FRLFRC74E04B157I" as FiscalCode,
  toAddress: "email@example.com" as EmailAddress
};

const lMailerTransporterMock = {} as unknown as mail.MailerTransporter;

describe("SendUserDataDeleteEmailActivity", () => {
  it("should respond with 'SUCCESS' if the mail is sent", async () => {
    vi.spyOn(mail, "sendMail").mockReturnValueOnce(TE.of("SUCCESS"));

    const SendUserDataDeleteEmailActivityHandler = getActivityFunction(
      lMailerTransporterMock,
      defaultNotificationParams
    );

    const result = await SendUserDataDeleteEmailActivityHandler(
      mockContext,
      input
    );

    expect(result.kind).toBe("SUCCESS");
  });

  it("should respond with 'ERROR' if the mail is not sent", async () => {
    const errorMessage = "Test Error";

    vi.spyOn(mail, "sendMail").mockReturnValueOnce(
      TE.left(new Error(errorMessage))
    );

    const SendUserDataDeleteEmailActivityHandler = getActivityFunction(
      lMailerTransporterMock,
      defaultNotificationParams
    );

    try {
      await SendUserDataDeleteEmailActivityHandler(mockContext, input);
    } catch (e) {
      expect(e).toMatchObject({
        message: "Error while sending email: " + errorMessage
      });
    }
  });
});
