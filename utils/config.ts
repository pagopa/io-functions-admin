import { MailMultiTransportConnectionsFromString } from "io-functions-commons/dist/src/utils/multi_transport_connection";
/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

export type NullableString = t.TypeOf<typeof NullableString>;
const NullableString = t.union([t.string, t.undefined]);

// explude a specific value from a type
const AnyBut = <A, O = A>(but: A, base: t.Type<A, O> = t.any) =>
  t.brand(
    base,
    (
      s
    ): s is t.Branded<
      t.TypeOf<typeof base>,
      { readonly AnyBut: unique symbol }
    > => s !== but,
    "AnyBut"
  );

// configuration to send email
export type MailerConfig = t.TypeOf<typeof MailerConfig>;
export const MailerConfig = t.intersection([
  // common fields
  t.interface({
    MAIL_FROM: NonEmptyString
  }),
  // the following union includes the possible configuration variants for different mail transport we use in prod
  // undefined values are kept for easy usage
  t.union([
    // Using sendgrid
    t.interface({
      MAILHOG_HOSTNAME: t.undefined,
      MAILUP_SECRET: t.undefined,
      MAILUP_USERNAME: t.undefined,
      MAIL_TRANSPORTS: t.undefined,
      NODE_ENV: t.literal("production"),
      SENDGRID_API_KEY: NonEmptyString
    }),
    // using mailup
    t.interface({
      MAILHOG_HOSTNAME: t.undefined,
      MAILUP_SECRET: NonEmptyString,
      MAILUP_USERNAME: NonEmptyString,
      MAIL_TRANSPORTS: t.undefined,
      NODE_ENV: t.literal("production"),
      SENDGRID_API_KEY: t.undefined
    }),
    // Using multi-transport definition
    // Optional multi provider connection string
    // The connection string must be in the format:
    //   [mailup:username:password;][sendgrid:apikey:;]
    // Note that multiple instances of the same provider can be provided.
    t.interface({
      MAILHOG_HOSTNAME: t.undefined,
      MAILUP_SECRET: t.undefined,
      MAILUP_USERNAME: t.undefined,
      MAIL_TRANSPORTS: MailMultiTransportConnectionsFromString,
      NODE_ENV: t.literal("production"),
      SENDGRID_API_KEY: t.undefined
    }),
    t.interface({
      // the following states that a mailhog configuration is optional and can be provided only if not in prod
      MAILHOG_HOSTNAME: NonEmptyString,
      MAILUP_SECRET: t.undefined,
      MAILUP_USERNAME: t.undefined,
      MAIL_TRANSPORTS: t.undefined,
      NODE_ENV: AnyBut("production", NullableString),
      SENDGRID_API_KEY: t.undefined
    })
  ])
]);

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    COSMOSDB_KEY: NonEmptyString,
    COSMOSDB_NAME: NonEmptyString,
    COSMOSDB_URI: NonEmptyString,

    SERVICE_PRINCIPAL_CLIENT_ID: NonEmptyString,
    SERVICE_PRINCIPAL_SECRET: NonEmptyString,
    SERVICE_PRINCIPAL_TENANT_ID: NonEmptyString,

    AZURE_APIM: NonEmptyString,
    AZURE_APIM_HOST: NonEmptyString,
    AZURE_APIM_RESOURCE_GROUP: NonEmptyString,
    AZURE_SUBSCRIPTION_ID: NonEmptyString,

    ADB2C_CLIENT_ID: NonEmptyString,
    ADB2C_CLIENT_KEY: NonEmptyString,
    ADB2C_TENANT_ID: NonEmptyString,

    UserDataBackupStorageConnection: NonEmptyString,

    MESSAGE_CONTAINER_NAME: NonEmptyString,
    USER_DATA_BACKUP_CONTAINER_NAME: NonEmptyString,
    USER_DATA_CONTAINER_NAME: NonEmptyString,

    StorageConnection: NonEmptyString,
    SubscriptionFeedStorageConnection: NonEmptyString,
    UserDataArchiveStorageConnection: NonEmptyString,

    PUBLIC_API_KEY: NonEmptyString,
    PUBLIC_API_URL: NonEmptyString,

    PUBLIC_DOWNLOAD_BASE_URL: NonEmptyString,

    SESSION_API_KEY: NonEmptyString,
    SESSION_API_URL: NonEmptyString,

    LOGOS_URL: NonEmptyString,

    SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,
    USER_DATA_DELETE_DELAY_DAYS: NonEmptyString,

    isProduction: t.boolean
  }),
  MailerConfig
]);

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,
  isProduction: process.env.NODE_ENV === "production"
});

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
export function getConfig(): t.Validation<IConfig> {
  return errorOrConfig;
}

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
export function getConfigOrThrow(): IConfig {
  return errorOrConfig.getOrElseL(errors => {
    throw new Error(`Invalid configuration: ${readableReport(errors)}`);
  });
}
