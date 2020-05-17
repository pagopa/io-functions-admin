import { Context } from "@azure/functions";
import { NewMessage } from "io-functions-commons/dist/generated/definitions/NewMessage";
import { readableReport } from "italia-ts-commons/lib/reporters";

import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";

// TODO: switch text based on user's preferred_language
const userDataDownloadMessage = (
  blobName: string,
  password: string,
  publicDownloadBaseUrl: string
) =>
  NewMessage.decode({
    content: {
      markdown: `Caro/a Utente,
Abbiamo completato la gestione della tua richiesta di accesso.
Puoi scaricare al link che segue i tuoi dati personali che trattiamo tramite l’App IO utilizzando la relativa password.

Se hai necessità di maggiori dettagli o informazioni su questi dati o vuoi riceverne dettaglio,
ti invitiamo a scrivere all’indirizzo email dpo@pagopa.it.

Nel caso in cui tu non sia soddisfatto/a dalla modalità con cui abbiamo gestito la tua richiesta,
siamo a disposizione per risolvere domande o dubbi aggiuntivi, che puoi indicare scrivendo all’indirizzo email indicato sopra.

[Link all'archivio ZIP](${publicDownloadBaseUrl}/${blobName})

Password dell'archivio ZIP:

${password}

Grazie ancora per aver utilizzato IO,
il Team Privacy di PagoPA
`,
      subject: `IO App - richiesta di accesso ai dati`
    }
  }).getOrElseL(errs => {
    throw new Error("Invalid MessageContent: " + readableReport(errs));
  });

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

// Activity result
const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

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

export const getActivityFunction = (
  publicApiUrl: NonEmptyString,
  publicApiKey: NonEmptyString,
  publicDownloadBaseUrl: NonEmptyString,
  timeoutFetch: typeof fetch
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
        `SendUserDataDownloadMessageActivity|Cannot decode input|ERROR=${readableReport(
          errs
        )}|INPUT=${JSON.stringify(input)}`
      ),
    async ({ blobName, fiscalCode, password }) => {
      const logPrefix = `SendUserDataDownloadMessageActivity|PROFILE=${fiscalCode}`;
      context.log.verbose(`${logPrefix}|Sending user data download message`);

      // throws in case of timeout so
      // the orchestrator can schedule a retry
      const status = await sendMessage(
        fiscalCode,
        publicApiUrl,
        publicApiKey,
        userDataDownloadMessage(blobName, password, publicDownloadBaseUrl),
        timeoutFetch
      );

      if (status !== 201) {
        const msg = `${logPrefix}|ERROR=${status}`;
        if (status >= 500) {
          throw new Error(msg);
        } else {
          return failure(msg);
        }
      }

      context.log.verbose(`${logPrefix}|RESPONSE=${status}`);
      return success();
    }
  );
};

export default getActivityFunction;
