import * as HtmlToText from "html-to-text";
import { MailMultiTransportConnectionsFromString } from "io-functions-commons/dist/src/utils/multi_transport_connection";
import { MultiTransport } from "io-functions-commons/dist/src/utils/nodemailer";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import * as NodeMailer from "nodemailer";
import { getConfig } from "../utils/config";
import {
  getMailerTransporter,
  getTransportsForConnections
} from "../utils/email";
import { getActivityFunction } from "./handler";

const config = getConfig();

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

// Optional multi provider connection string
// The connection string must be in the format:
//   [mailup:username:password;][sendgrid:apikey:;]
// Note that multiple instances of the same provider can be provided.
const transports = MailMultiTransportConnectionsFromString.decode(
  config.MAIL_TRANSPORTS
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
        isProduction: config.isProduction,
        ...(sendgridApiKey
          ? { sendgridApiKey }
          : {
              // FIXME: handle non empty values in global config
              mailupSecret: NonEmptyString.decode(
                config.MAILUP_SECRET
              ).getOrElseL(_ => {
                throw new Error("env variable MAILUP_SECRET must not be empty");
              }),
              mailupUsername: NonEmptyString.decode(
                config.MAILUP_USERNAME
              ).getOrElseL(_ => {
                throw new Error(
                  "env variable MAILUP_USERNAME must not be empty"
                );
              })
            })
      });

const index = getActivityFunction(mailerTransporter, {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
});

export default index;
