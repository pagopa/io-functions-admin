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
  abbiamo completato la gestione della richiesta di accesso ai tuoi dati.
  
  Qui trovi il link per scaricare i dati personali che trattiamo tramite l’App IO.
  I dati sono compressi in un file zip, che è disponibile per i prossimi 15 giorni.
  
  Clicca il link qui sotto:
  
  [Link all'archivio ZIP](${publicDownloadBaseUrl}/${blobName})
  
  Oppure copia e incolla l’indirizzo nel tuo browser:
  
  \`${publicDownloadBaseUrl}/${blobName}\`
  
  Per aprire il file ZIP, usa questa password:
  
  \`${password}\`
  
  I dati contenuti nello zip sono in formato yaml: un formato standard che in informatica consente lo scambio di dati fra applicazioni diverse.
  
  Nello zip, potrai trovare:
  - Il testo dei Messaggi da te ricevuti;
  - Le tue preferenze di notifica;
  - L’indirizzo email  da te indicato e, se del caso, la conferma della sua validazione;
  - Il tuo codice fiscale.  
  
  ## Come scaricare i dati
  
  Per una migliore esperienza utente, ti consigliamo di copiare il link che hai ricevuto e aprirlo da PC.
  
  E’ possibile effettuare lo scaricamento anche da smartphone, qualora tu avessi un’app di file explorer installata. L’app ti servirà per aprire l’archivio.zip una volta scaricato.
  Di seguito trovi le istruzioni per i due diversi sistemi operativi.
  
  Dispositivi iOS:
  - Premi il link che ti abbiamo inviato qui sopra
  - Verrai reindirizzato alla finestra del browser in cui ti verrà chiesto se vuoi davvero scaricare un archivio.zip il cui nome inizia con il tuo codice fiscale
  - Clicca su “Scarica”
  - Viene visualizzata una freccia alla destra della barra del browser. Cliccala e poi clicca sul titolo del file.
  - Se hai l’app File installata, ti si aprirà una finestra in cui potrai visualizzare il pacchetto.
  - Clicca sul documento e inserisci la password per decomprimere il file.
  
  Dispositivi Android:
  - Premi il link qui sopra
  - Verrai reindirizzato alla finestra del browser, in cui una notifica a fondo pagina ti informa dello scaricamento in corso.
  - Al termine dello scaricamento, clicca la notifica per aprire il file.
  - Seleziona l’app con cui aprire il file zip
  - Clicca sul documento e inserisci la password per decomprimere il file.  
  
  ## Informazioni sul trattamento dei tuoi dati
  
  Ai sensi del GDPR, ti confermiamo che trattiamo i tuoi dati personali all’interno dell’App Io.
  In particolare,  trattiamo i tuoi dati identificativi e di contatto per finalità di identificazione e autenticazione, registrazione delle preferenze e invio di messaggi strettamente legati al funzionamento dell’App, nonché di assistenza e debug e attività volte ad assicurare la sicurezza. Inoltre, come responsabili del trattamento degli Enti Erogatori, per consentirti di usufruire dei Servizi, trattiamo oltre ai tuoi dati identificativi e di contatto, anche i dati contenuti nei messaggi.
  
  Alcuni dei dati da noi trattati sono raccolti dal tuo provider Spid al momento della tua registrazione ovvero, qualora tu ti sia registrato tramite CIE, dal Ministero dell’Interno.
  
  I tuoi dati sono trattati anche per tramite di fornitori terzi, situati in paesi al di fuori dello SEE. Utilizziamo per i trasferimenti extra UE le garanzie previste dagli art. 44 e seguenti del GDPR. In particolare, utilizziamo fornitori certificati Privacy Shield e, in ogni caso, laddove necessario, abbiamo vincolato tali fornitori al rispetto delle condizioni contrattuali tipo approvate dalla Commissione. 
  
  Conserviamo i tuoi dati per un tempo limitato. In particolare, I dati relativi ai Messaggi inviati per conto degli Enti Erogatori sono cancellati dopo 3 anni dalla loro ricezione e i tuoi dati identificativi sono conservati per un periodo massimo di 10 anni dalla tua cancellazione.
  
  Puoi richiedere di esercitare il tuo diritto di limitazione e opposizione del trattamento e a chiedere la rettifica del tuo indirizzo email. Potrai inoltre rivolgerti al Garante per la protezione dei dati personali.
  Con riferimento ai dati dei Servizi offerti dagli Enti Erogatori, tutti i diritti dovranno essere esercitati presso di loro.
  
  Puoi trovare tutte le informazioni sul trattamento dei tuoi dati nella nostra [Informativa Privacy](ioit://PROFILE_PRIVACY) che è accessibile in ogni momento nella sezione Profilo/Privacy e Condizioni d’uso.
  Se ti servono dettagli o informazioni su questi dati, ti invitiamo a scrivere all’indirizzo email dpo@pagopa.it.
  
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
