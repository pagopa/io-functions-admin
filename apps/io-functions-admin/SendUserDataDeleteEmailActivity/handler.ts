import { Context } from "@azure/functions";
import { NewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { sendMail } from "@pagopa/io-functions-commons/dist/src/mailer";
import { markdownToHtml } from "@pagopa/io-functions-commons/dist/src/utils/markdown";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as HtmlToText from "html-to-text";
import * as t from "io-ts";
import * as NodeMailer from "nodemailer";

import { EmailAddress } from "../generated/definitions/EmailAddress";

// TODO: switch text based on user's preferred_language
const userDataDeleteMessage = pipe(
  {
    content: {
      markdown: `Ciao, come da te richiesto abbiamo eseguito la tua richiesta di cancellazione.
Potrai iscriverti nuovamente all’App IO in ogni momento effettuando una nuova procedura di registrazione. Grazie per aver utilizzato IO`,
      subject: `Eliminazione del tuo profilo su IO`
    }
  },
  NewMessage.decode,
  E.getOrElseW(errs => {
    throw new Error("Invalid MessageContent: " + readableReport(errs));
  })
);

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

export const getActivityFunction =
  (
    lMailerTransporter: NodeMailer.Transporter,
    notificationDefaultParams: INotificationDefaults
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
          `SendUserDataDeleteEmailActivity|Cannot decode input|ERROR=${readableReport(
            errs
          )}|INPUT=${JSON.stringify(input)}`
        )
      ),
      TE.fromEither,
      TE.chainW(({ fiscalCode, toAddress }) => {
        const logPrefix = `SendUserDataDeleteEmailActivity|PROFILE=${fiscalCode}`;
        context.log.verbose(`${logPrefix}|Sending user data delete email`);

        const { content } = userDataDeleteMessage;
        return pipe(
          TE.tryCatch(async () => {
            const documentHtml = await markdownToHtml
              .process(content.markdown)
              .then(e => e.toString());

            // converts the HTML to pure text to generate the text version of the message
            const bodyText = HtmlToText.fromString(
              documentHtml,
              notificationDefaultParams.HTML_TO_TEXT_OPTIONS
            );

            return { bodyText, documentHtml };
          }, E.toError),
          TE.chain(({ bodyText, documentHtml }) =>
            sendMail(lMailerTransporter, {
              from: notificationDefaultParams.MAIL_FROM,
              html: documentHtml,
              subject: content.subject,
              text: bodyText,
              to: toAddress
            })
          ),
          TE.map(() => context.log.verbose(`${logPrefix}|RESULT=SUCCESS`)),
          TE.mapLeft(error => {
            context.log.error(`${logPrefix}|ERROR=${error.message}`);
            throw new Error(`Error while sending email: ${error.message}`);
          })
        );
      }),
      TE.map(() => success()),
      TE.toUnion
    )();
  };

export default getActivityFunction;
