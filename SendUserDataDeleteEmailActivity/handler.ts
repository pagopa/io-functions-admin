import { Context } from "@azure/functions";
import { NewMessage } from "io-functions-commons/dist/generated/definitions/NewMessage";
import { readableReport } from "italia-ts-commons/lib/reporters";

import * as HtmlToText from "html-to-text";
import { markdownToHtml } from "io-functions-commons/dist/src/utils/markdown";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as NodeMailer from "nodemailer";
import { EmailAddress } from "../generated/definitions/EmailAddress";

import { sendMail } from "io-functions-commons/dist/src/mailer";

// TODO: switch text based on user's preferred_language
const userDataDeleteMessage = NewMessage.decode({
  content: {
    markdown: `Ciao, come da te richiesto abbiamo eseguito la tua richiesta di cancellazione.
Potrai iscriverti nuovamente all’App IO in ogni momento effettuando una nuova procedura di registrazione. Grazie per aver utilizzato IO`,
    subject: `Eliminazione del tuo profilo su IO`
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

      const { content } = userDataDeleteMessage;

      const documentHtml = await markdownToHtml
        .process(content.markdown)
        .then(e => e.toString());

      // converts the HTML to pure text to generate the text version of the message
      const bodyText = HtmlToText.fromString(
        documentHtml,
        notificationDefaultParams.HTML_TO_TEXT_OPTIONS
      );

      // trigger email delivery
      await sendMail(lMailerTransporter, {
        from: notificationDefaultParams.MAIL_FROM,
        html: documentHtml,
        subject: content.subject,
        text: bodyText,
        to: toAddress
      })
        .bimap(
          error => {
            context.log.error(`${logPrefix}|ERROR=${error.message}`);
            throw new Error(`Error while sending email: ${error.message}`);
          },
          () => context.log.verbose(`${logPrefix}|RESULT=SUCCESS`)
        )
        .run();

      return success();
    }
  );
};

export default getActivityFunction;
