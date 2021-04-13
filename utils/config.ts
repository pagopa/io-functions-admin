/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import { MailerConfig } from "io-functions-commons/dist/src/mailer";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IConfig = t.intersection([
  t.interface({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    COSMOSDB_KEY: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    COSMOSDB_NAME: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    COSMOSDB_URI: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    SERVICE_PRINCIPAL_CLIENT_ID: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SERVICE_PRINCIPAL_SECRET: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SERVICE_PRINCIPAL_TENANT_ID: NonEmptyString,

    // eslint-disable-next-line sort-keys, @typescript-eslint/naming-convention
    AZURE_APIM: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    AZURE_APIM_HOST: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    AZURE_APIM_RESOURCE_GROUP: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    AZURE_SUBSCRIPTION_ID: NonEmptyString,

    // eslint-disable-next-line sort-keys, @typescript-eslint/naming-convention
    ADB2C_CLIENT_ID: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ADB2C_CLIENT_KEY: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ADB2C_TENANT_ID: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    UserDataBackupStorageConnection: NonEmptyString,

    // eslint-disable-next-line sort-keys, @typescript-eslint/naming-convention
    MESSAGE_CONTAINER_NAME: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    USER_DATA_BACKUP_CONTAINER_NAME: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    USER_DATA_CONTAINER_NAME: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention, sort-keys
    AssetsStorageConnection: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    StorageConnection: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SubscriptionFeedStorageConnection: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    UserDataArchiveStorageConnection: NonEmptyString,

    // eslint-disable-next-line sort-keys, @typescript-eslint/naming-convention
    PUBLIC_API_KEY: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    PUBLIC_API_URL: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    PUBLIC_DOWNLOAD_BASE_URL: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    SESSION_API_KEY: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SESSION_API_URL: NonEmptyString,

    // eslint-disable-next-line sort-keys, @typescript-eslint/naming-convention
    LOGOS_URL: NonEmptyString,

    // eslint-disable-next-line @typescript-eslint/naming-convention
    SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,
    // eslint-disable-next-line @typescript-eslint/naming-convention
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
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getConfigOrThrow(): IConfig {
  return errorOrConfig.getOrElseL(errors => {
    throw new Error(`Invalid configuration: ${readableReport(errors)}`);
  });
}
