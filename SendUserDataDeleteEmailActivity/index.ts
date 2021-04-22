import { getMailerTransporter } from "@pagopa/io-functions-commons/dist/src/mailer";
import * as HtmlToText from "html-to-text";
import { getConfigOrThrow } from "../utils/config";
import { getActivityFunction } from "./handler";

const config = getConfigOrThrow();

// default sender for email
const MAIL_FROM = config.MAIL_FROM;

const HTML_TO_TEXT_OPTIONS: HtmlToText.HtmlToTextOptions = {
  ignoreImage: true, // ignore all document images
  tables: true
};

const mailerTransporter = getMailerTransporter(config);

const index = getActivityFunction(mailerTransporter, {
  HTML_TO_TEXT_OPTIONS,
  MAIL_FROM
});

export default index;
