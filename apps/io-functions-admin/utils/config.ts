import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import { CommaSeparatedListOf } from "@pagopa/ts-commons/lib/comma-separated-list";
import {
  IntegerFromString,
  NonNegativeInteger
} from "@pagopa/ts-commons/lib/numbers";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { withDefault } from "@pagopa/ts-commons/lib/types";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */
import * as t from "io-ts";

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    AssetsStorageConnection: NonEmptyString,
    AZURE_APIM: NonEmptyString,
    AZURE_APIM_HOST: NonEmptyString,

    AZURE_APIM_RESOURCE_GROUP: NonEmptyString,
    AZURE_SUBSCRIPTION_ID: NonEmptyString,
    CitizenAuthStorageConnection: NonEmptyString,

    COSMOSDB_KEY: NonEmptyString,
    COSMOSDB_NAME: NonEmptyString,
    COSMOSDB_URI: NonEmptyString,
    FAILED_USER_DATA_PROCESSING_TABLE: NonEmptyString,

    FailedUserDataProcessingStorageConnection: NonEmptyString,

    GET_USERS_PAGE_SIZE: withDefault(
      IntegerFromString.pipe(NonNegativeInteger),
      "100" as unknown as NonNegativeInteger
    ),
    INSTANT_DELETE_ENABLED_USERS: CommaSeparatedListOf(FiscalCode),
    isProduction: t.boolean,

    LOCKED_PROFILES_STORAGE_CONNECTION_STRING: NonEmptyString,
    LOCKED_PROFILES_TABLE_NAME: NonEmptyString,
    LOG_RSA_PK: NonEmptyString,
    LOGOS_URL: NonEmptyString,
    MESSAGE_CONTAINER_NAME: NonEmptyString,

    PROFILE_EMAILS_STORAGE_CONNECTION_STRING: NonEmptyString,
    PROFILE_EMAILS_TABLE_NAME: NonEmptyString,

    PUBLIC_API_KEY: NonEmptyString,

    PUBLIC_API_URL: NonEmptyString,
    PUBLIC_DOWNLOAD_BASE_URL: NonEmptyString,

    SanitizeUserProfileQueueName: NonEmptyString,

    SERVICE_PRINCIPAL_CLIENT_ID: NonEmptyString,
    SERVICE_PRINCIPAL_SECRET: NonEmptyString,
    SERVICE_PRINCIPAL_TENANT_ID: NonEmptyString,

    SESSION_MANAGER_INTERNAL_API_KEY: NonEmptyString,
    SESSION_MANAGER_INTERNAL_API_URL: NonEmptyString,

    StorageConnection: NonEmptyString,

    SubscriptionFeedStorageConnection: NonEmptyString,
    SUBSCRIPTIONS_FEED_TABLE: NonEmptyString,

    USER_DATA_BACKUP_CONTAINER_NAME: NonEmptyString,
    USER_DATA_CONTAINER_NAME: NonEmptyString,

    USER_DATA_DELETE_DELAY_DAYS: NonEmptyString,

    UserDataArchiveStorageConnection: NonEmptyString,
    UserDataBackupStorageConnection: NonEmptyString
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

export type IsUserEligibleForInstantDelete = (
  fiscalCode: FiscalCode
) => boolean;

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */

export function getConfig(): t.Validation<IConfig> {
  return errorOrConfig;
}

export function getConfigOrThrow(): IConfig {
  return pipe(
    errorOrConfig,
    E.getOrElseW(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
}
export const isUserEligibleForInstantDelete: ({
  INSTANT_DELETE_ENABLED_USERS
}: IConfig) => IsUserEligibleForInstantDelete =
  ({ INSTANT_DELETE_ENABLED_USERS }) =>
  fiscalCode =>
    INSTANT_DELETE_ENABLED_USERS.includes(fiscalCode);
