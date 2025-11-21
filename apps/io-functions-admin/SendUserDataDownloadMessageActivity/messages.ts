import { NewMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/NewMessage";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";

// TODO: switch text based on user's preferred_language
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const userDataDownloadMessage = (
  blobName: string,
  password: string,
  publicDownloadBaseUrl: string
) =>
  pipe(
    {
      content: {
        markdown: `Ciao,
  i tuoi dati sono pronti per essere consultati.
  
  Qui trovi il link per scaricare i dati principali che trattiamo tramite l’App IO.
  I dati sono compressi in un file .zip, che sarà disponibile per i prossimi 15 giorni, dopodiché verrà cancellato dai nostri sistemi, ma potrai sempre effettuare una nuova richiesta.
  
  Premi sul link qui sotto:
  
  [Link al file](${publicDownloadBaseUrl}/${blobName})
  
  Oppure copia e incolla l’indirizzo nel tuo browser:
  
  \`${publicDownloadBaseUrl}/${blobName}\`
  
  Per aprire il file .zip, usa questa password:
  
  \`${password}\`
  
  I dati contenuti nel file .zip sono in formato yaml, un formato standard che in informatica consente lo scambio di dati fra applicazioni diverse.
  
  Nel file puoi trovare:
  - il testo dei Messaggi da te ricevuti;
  - le tue preferenze di notifica;
  - l’indirizzo email da te indicato e, se del caso, la conferma della sua validazione;
  - il tuo codice fiscale.  
  
  ## Come scaricare i dati
  
  Per una migliore esperienza utente, ti consigliamo di copiare il link che hai ricevuto e aprirlo da PC. Puoi farlo anche da smartphone, ma in tal caso avrai bisogno di un'applicazione apposita per aprire il file in formato .zip.
  Una volta completato il download, ti basterà inserire la password che trovi in questo messaggio per accedere al file.
  
  ## Informazioni sul trattamento dei tuoi dati
  Ti ricordiamo che puoi sempre esercitare i diritti previsti dagli artt. 15 - 22 del GDPR con riferimento ai dati presenti su IO. Con riferimento ai dati dei servizi offerti dagli enti erogatori, tutti i diritti dovranno essere esercitati presso di loro.
 
  Puoi trovare tutte le informazioni sul trattamento dei tuoi dati nella nostra[Informativa Privacy](ioit://PROFILE_PRIVACY), sempre disponibile in app e all'indirizzo <https://io.italia.it/app-content/tos_privacy.html>.
 Per ulteriori dettagli o informazioni su questi dati, ti invitiamo a scrivere all’indirizzo email <dpo@pagopa.it> o a contattarci tramite l'apposito [modulo di contatto](https://privacyportal-de.onetrust.com/webform/77f17844-04c3-4969-a11d-462ee77acbe1/9ab6533d-be4a-482e-929a-0d8d2ab29df8).
  
  Grazie ancora per aver utilizzato IO!
  Il Team Privacy di PagoPA S.p.A.
    
  `,
        subject: `IO App - richiesta di accesso ai dati`
      }
    },
    NewMessage.decode,
    E.getOrElseW(errs => {
      throw new Error(`Invalid MessageContent: ${readableReport(errs)}`);
    })
  );
