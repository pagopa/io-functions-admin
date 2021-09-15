/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    /* eslint-disable sort-keys */
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

    AssetsStorageConnection: NonEmptyString,
    FailedUserDataProcessingStorageConnection: NonEmptyString,
    StorageConnection: NonEmptyString,
    SubscriptionFeedStorageConnection: NonEmptyString,
    UserDataArchiveStorageConnection: NonEmptyString,

    PUBLIC_API_KEY: NonEmptyString,
    PUBLIC_API_URL: NonEmptyString,

    PUBLIC_DOWNLOAD_BASE_URL: NonEmptyString,

    SESSION_API_KEY: NonEmptyString,
    SESSION_API_URL: NonEmptyString,

    LOGOS_URL: NonEmptyString,

    FAILED_USER_DATA_PROCESSING_TABLE: NonEmptyString,
    SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,
    USER_DATA_DELETE_DELAY_DAYS: NonEmptyString,

    isProduction: t.boolean
    /* eslint-enable sort-keys */
  }),
  MailerConfig
]);

// raw config object, basically the env object enriched with custom fields
export const envConfig = {
  ...process.env,
  isProduction: process.env.NODE_ENV === "production"
};

// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode(envConfig);

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
  return pipe(
    errorOrConfig,
    E.getOrElse(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
}
