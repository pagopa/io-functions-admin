import * as HtmlToText from "html-to-text";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { MailMultiTransportConnectionsFromString } from "io-functions-commons/dist/src/utils/multi_transport_connection";
import { MultiTransport } from "io-functions-commons/dist/src/utils/nodemailer";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as NodeMailer from "nodemailer";
import {
  getMailerTransporter,
  getTransportsForConnections
} from "../utils/email";
import { getActivityFunction } from "./handler";

// Whether we're in a production environment
const isProduction = process.env.NODE_ENV === "production";

// Optional SendGrid key
const sendgridApiKey = NonEmptyString.decode(
  process.env.SENDGRID_API_KEY
).getOrElse(undefined);

// default sender for email
const MAIL_FROM = getRequiredStringEnv("MAIL_FROM");

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

// Optional multi provider connection string
// The connection string must be in the format:
//   [mailup:username:password;][sendgrid:apikey:;]
// Note that multiple instances of the same provider can be provided.
const transports = MailMultiTransportConnectionsFromString.decode(
  process.env.MAIL_TRANSPORTS
)
  .map(getTransportsForConnections)
  .getOrElse([]);

// if we have a valid multi transport configuration, configure a
// Multi transport, or else fall back to the default logic
const mailerTransporter =
  transports.length > 0
    ? NodeMailer.createTransport(
        MultiTransport({
          transports
        })
      )
    : getMailerTransporter({
        isProduction,
        ...(sendgridApiKey
          ? { sendgridApiKey }
          : {
              mailupSecret: getRequiredStringEnv("MAILUP_SECRET"),
              mailupUsername: getRequiredStringEnv("MAILUP_USERNAME")
            })
      });

const index = getActivityFunction(mailerTransporter, {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
});

export default index;
