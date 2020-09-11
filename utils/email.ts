import { catOptions } from "fp-ts/lib/Array";
import { none, some } from "fp-ts/lib/Option";

import { MailUpTransport } from "io-functions-commons/dist/src/utils/mailup";
import { MailMultiTransportConnections } from "io-functions-commons/dist/src/utils/multi_transport_connection";

import { agent } from "italia-ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import * as NodeMailer from "nodemailer";
import nodemailerSendgrid = require("nodemailer-sendgrid");
import Mail = require("nodemailer/lib/mailer");

// 5 seconds timeout by default
const DEFAULT_EMAIL_REQUEST_TIMEOUT_MS = 5000;

// Must be an https endpoint so we use an https agent
const abortableFetch = AbortableFetch(agent.getHttpsFetch(process.env));
const fetchWithTimeout = setFetchTimeout(
  DEFAULT_EMAIL_REQUEST_TIMEOUT_MS as Millisecond,
  abortableFetch
);

interface IMailUpOptions {
  mailupSecret: NonEmptyString;
  mailupUsername: NonEmptyString;
}

interface ISendGridOptions {
  sendgridApiKey: NonEmptyString;
}

type MailTransportOptions = (IMailUpOptions | ISendGridOptions) & {
  isProduction: boolean;
};

export function getMailerTransporter(opts: MailTransportOptions): Mail {
  return opts.isProduction
    ? NodeMailer.createTransport(
        "sendgridApiKey" in opts
          ? nodemailerSendgrid({
              apiKey: opts.sendgridApiKey
            })
          : MailUpTransport({
              creds: {
                Secret: opts.mailupSecret,
                Username: opts.mailupUsername
              },
              // HTTPS-only fetch with optional keepalive agent
              fetchAgent: toFetch(fetchWithTimeout)
            })
      )
    : // For development we use mailhog to intercept emails
      // Use the `docker-compose.yml` file to run the mailhog server
      NodeMailer.createTransport({
        host: process.env.MAILHOG_HOSTNAME,
        port: 1025,
        secure: false
      });
}

/**
 * Converts an array of mail transport connections into their corresponding
 * nodemailer transports
 */
export function getTransportsForConnections(
  configs: MailMultiTransportConnections
): ReadonlyArray<NodeMailer.Transport> {
  return catOptions(
    configs.map(config => {
      // configure mailup
      if (
        config.transport === "mailup" &&
        NonEmptyString.is(config.password) &&
        NonEmptyString.is(config.username)
      ) {
        return some(
          MailUpTransport({
            creds: {
              Secret: config.password,
              Username: config.username
            },
            // HTTPS-only fetch with optional keepalive agent
            fetchAgent: toFetch(fetchWithTimeout)
          })
        );
      }

      // sendgrid uses username as api key
      if (
        config.transport === "sendgrid" &&
        NonEmptyString.is(config.username)
      ) {
        return some(
          nodemailerSendgrid({
            apiKey: config.username
          })
        );
      }

      // default ignore
      return none;
    })
  );
}
