import { Context } from "@azure/functions";
import { NewMessage } from "io-functions-commons/dist/generated/definitions/NewMessage";
import { readableReport } from "italia-ts-commons/lib/reporters";

import { Either } from "fp-ts/lib/Either";
import * as HtmlToText from "html-to-text";
import { sendMail } from "io-functions-commons/dist/src/utils/email";
import { markdownToHtml } from "io-functions-commons/dist/src/utils/markdown";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as NodeMailer from "nodemailer";
import { EmailAddress } from "../generated/definitions/EmailAddress";

// TODO: switch text based on user's preferred_language
const userDataDeleteMessage = () =>
  NewMessage.decode({
    content: {
      markdown: `+++ here goes the message +++ Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam imperdiet elementum tincidunt. Sed congue elementum neque id fermentum. Proin ex lectus, volutpat sit amet nisi tincidunt, feugiat consectetur mauris. Morbi commodo condimentum fringilla. Nam vestibulum mauris vel nulla ullamcorper, ut suscipit nisl dapibus. Mauris orci quam, convallis vitae sagittis vel.`,
      subject: `IO App - conferma eliminazione dati`
    }
  }).getOrElseL(errs => {
    throw new Error("Invalid MessageContent: " + readableReport(errs));
  });

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
  fiscalCode: FiscalCode,
  toAddress: EmailAddress
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export interface INotificationDefaults {
  readonly HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions;
  readonly MAIL_FROM: NonEmptyString;
}

export const getActivityFunction = (
  lMailerTransporter: NodeMailer.Transporter,
  notificationDefaultParams: INotificationDefaults
) => (context: Context, input: unknown): Promise<ActivityResult> => {
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

  return ActivityInput.decode(input).fold<Promise<ActivityResult>>(
    async errs =>
      failure(
        `SendUserDataDeleteEmailActivity|Cannot decode input|ERROR=${readableReport(
          errs
        )}|INPUT=${JSON.stringify(input)}`
      ),
    async ({ toAddress, fiscalCode }) => {
      const logPrefix = `SendUserDataDeleteEmailActivity|PROFILE=${fiscalCode}`;
      context.log.verbose(`${logPrefix}|Sending user data delete email`);

      const { content } = userDataDeleteMessage();

      const documentHtml = await markdownToHtml
        .process(content.markdown)
        .then(e => e.toString());

      // converts the HTML to pure text to generate the text version of the message
      const bodyText = HtmlToText.fromString(
        documentHtml,
        notificationDefaultParams.HTML_TO_TEXT_OPTIONS
      );

      const sendResult: Either<
        Error,
        NodeMailer.SendMailOptions
      > = await sendMail(lMailerTransporter, {
        from: notificationDefaultParams.MAIL_FROM,
        html: documentHtml,
        subject: content.subject,
        text: bodyText,
        to: toAddress
      });

      if (sendResult.isLeft()) {
        const error = sendResult.value;
        // track the event of failed delivery
        context.log.error(`${logPrefix}|ERROR=${error.message}`);
        throw new Error(`Error while sending email: ${error.message}`);
      }

      context.log.verbose(`${logPrefix}|RESULT=SUCCESS`);

      return success();
    }
  );
};

export default getActivityFunction;
