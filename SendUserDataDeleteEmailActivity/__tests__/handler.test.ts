/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonar/sonar-max-lines-per-function */
/* eslint-disable sonarjs/no-identical-functions */

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { ActivityInput, getActivityFunction } from "../handler";

import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";

import * as HtmlToText from "html-to-text";

import { EmailAddress } from "@pagopa/io-functions-commons/dist/generated/definitions/EmailAddress";
import * as mail from "@pagopa/io-functions-commons/dist/src/mailer";

beforeEach(() => jest.clearAllMocks());

const mockContext = {
  log: {
    // eslint-disable-next-line no-console
    error: console.error,
    // eslint-disable-next-line no-console
    info: console.log,
    // eslint-disable-next-line no-console
    verbose: console.log,
    // eslint-disable-next-line no-console
    warn: console.warn
  }
} as any;

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

const MAIL_FROM = "IO - l’app dei servizi pubblici <no-reply@io.italia.it>" as NonEmptyString;
const defaultNotificationParams = {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
};

const input: ActivityInput = {
  fiscalCode: "FRLFRC74E04B157I" as FiscalCode,
  toAddress: "email@example.com" as EmailAddress
};

const lMailerTransporterMock = ({} as unknown) as mail.MailerTransporter;

describe("SendUserDataDeleteEmailActivity", () => {
  it("should respond with 'SUCCESS' if the mail is sent", async () => {
    jest.spyOn(mail, "sendMail").mockReturnValueOnce(taskEither.of("SUCCESS"));

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
    const errorMessage: string = "Test Error";

    jest
      .spyOn(mail, "sendMail")
      .mockReturnValueOnce(fromLeft(new Error(errorMessage)));

    const SendUserDataDeleteEmailActivityHandler = getActivityFunction(
      lMailerTransporterMock,
      defaultNotificationParams
    );

    try {
      await SendUserDataDeleteEmailActivityHandler(mockContext, input);
    } catch (e) {
      expect(e.message).toBe("Error while sending email: " + errorMessage);
    }
  });
});
