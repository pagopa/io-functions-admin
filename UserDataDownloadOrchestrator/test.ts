import * as dotenv from "dotenv";
dotenv.config();

import { Context } from "@azure/functions";
import sendUserDataDownloadMessageActivity from "../SendUserDataDownloadMessageActivity";

const context = ({
  log: {
    // tslint:disable-next-line: no-console
    error: console.error,
    // tslint:disable-next-line: no-console
    info: console.log,
    // tslint:disable-next-line: no-console
    verbose: console.log
  }
  // tslint:disable-next-line: no-any
} as any) as Context;

// tslint:disable-next-line: no-any
sendUserDataDownloadMessageActivity(context, {
  blobName: "IDRCLRN",
  fiscalCode: "SPNDNL80R13C523K",
  // tslint:disable-next-line: no-hardcoded-credentials
  password: "CRNVRS"
  // tslint:disable-next-line: no-console
}).catch(console.error);
