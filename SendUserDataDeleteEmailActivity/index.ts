import * as HtmlToText from "html-to-text";
import { MailMultiTransportConnectionsFromString } from "io-functions-commons/dist/src/utils/multi_transport_connection";
import { MultiTransport } from "io-functions-commons/dist/src/utils/nodemailer";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as NodeMailer from "nodemailer";
import { getConfigOrThrow } from "../utils/config";
import {
  getMailerTransporter,
  getTransportsForConnections
} from "../utils/email";
import { getActivityFunction } from "./handler";

const config = getConfigOrThrow();

// Optional SendGrid key
const sendgridApiKey = NonEmptyString.decode(config.SENDGRID_API_KEY).getOrElse(
  undefined
);

// default sender for email
const MAIL_FROM = config.MAIL_FROM;

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

// if we have a valid multi transport configuration, configure a
// Multi transport, or else fall back to the default logic
const mailerTransporter =
  typeof config.MAIL_TRANSPORTS !== "undefined"
    ? NodeMailer.createTransport(
        MultiTransport({
          transports: getTransportsForConnections(config.MAIL_TRANSPORTS)
        })
      )
    : getMailerTransporter({
        isProduction: config.isProduction,
        ...(typeof config.SENDGRID_API_KEY !== "undefined"
          ? {
              sendgridApiKey: config.SENDGRID_API_KEY,  
            }
          : {
              mailupSecret: config.MAILUP_SECRET,
              mailupUsername: config.MAILUP_USERNAME
            })
      });

const index = getActivityFunction(mailerTransporter, {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
});

export default index;
