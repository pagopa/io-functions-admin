import { tryCatch2v } from "fp-ts/lib/Either";
import { toError } from "fp-ts/lib/Either";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

export type IConfig = ReturnType<typeof getEnv>;

// base read function
// tslint:disable typedef
const getEnv = () => ({
  COSMOSDB_KEY: getRequiredStringEnv("COSMOSDB_KEY"),
  COSMOSDB_NAME: getRequiredStringEnv("COSMOSDB_NAME"),
  COSMOSDB_URI: getRequiredStringEnv("COSMOSDB_URI"),

  SERVICE_PRINCIPAL_CLIENT_ID: getRequiredStringEnv(
    "SERVICE_PRINCIPAL_CLIENT_ID"
  ),
  SERVICE_PRINCIPAL_SECRET: getRequiredStringEnv("SERVICE_PRINCIPAL_SECRET"),
  SERVICE_PRINCIPAL_TENANT_ID: getRequiredStringEnv(
    "SERVICE_PRINCIPAL_TENANT_ID"
  ),

  AZURE_APIM: getRequiredStringEnv("AZURE_APIM"),
  AZURE_APIM_HOST: getRequiredStringEnv("AZURE_APIM_HOST"),
  AZURE_APIM_RESOURCE_GROUP: getRequiredStringEnv("AZURE_APIM_RESOURCE_GROUP"),
  AZURE_SUBSCRIPTION_ID: getRequiredStringEnv("AZURE_SUBSCRIPTION_ID"),

  ADB2C_CLIENT_ID: getRequiredStringEnv("ADB2C_CLIENT_ID"),
  ADB2C_CLIENT_KEY: getRequiredStringEnv("ADB2C_CLIENT_KEY"),
  ADB2C_TENANT_ID: getRequiredStringEnv("ADB2C_TENANT_ID"),

  UserDataBackupStorageConnection: getRequiredStringEnv(
    "UserDataBackupStorageConnection"
  ),

  MESSAGE_CONTAINER_NAME: getRequiredStringEnv("MESSAGE_CONTAINER_NAME"),
  USER_DATA_BACKUP_CONTAINER_NAME: getRequiredStringEnv(
    "USER_DATA_BACKUP_CONTAINER_NAME"
  ),
  USER_DATA_CONTAINER_NAME: getRequiredStringEnv("USER_DATA_CONTAINER_NAME"),

  StorageConnection: getRequiredStringEnv("StorageConnection"),
  SubscriptionFeedStorageConnection: getRequiredStringEnv(
    "SubscriptionFeedStorageConnection"
  ),
  UserDataArchiveStorageConnection: getRequiredStringEnv(
    "UserDataArchiveStorageConnection"
  ),

  PUBLIC_API_KEY: getRequiredStringEnv("PUBLIC_API_KEY"),
  PUBLIC_API_URL: getRequiredStringEnv("PUBLIC_API_URL"),

  PUBLIC_DOWNLOAD_BASE_URL: getRequiredStringEnv("PUBLIC_DOWNLOAD_BASE_URL"),

  SESSION_API_KEY: getRequiredStringEnv("SESSION_API_KEY"),
  SESSION_API_URL: getRequiredStringEnv("SESSION_API_URL"),

  LOGOS_URL: getRequiredStringEnv("LOGOS_URL"),

  SUBSCRIPTIONS_FEED_TABLE: getRequiredStringEnv("SUBSCRIPTIONS_FEED_TABLE"),
  USER_DATA_DELETE_DELAY_DAYS: getRequiredStringEnv(
    "USER_DATA_DELETE_DELAY_DAYS"
  ),

  // FIXME: email configuration values may be required or not depending on their values
  MAIL_FROM: getRequiredStringEnv("MAIL_FROM"),
  MAIL_TRANSPORTS: process.env.MAIL_TRANSPORTS,

  MAILHOG_HOSTNAME: process.env.MAILHOG_HOSTNAME,
  MAILUP_SECRET: process.env.MAILUP_SECRET,
  MAILUP_USERNAME: process.env.MAILUP_USERNAME,
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,

  // Whether we're in a production environment
  isProduction: process.env.NODE_ENV === "production"
});

// No need to re-evaluate this object for each call
const errorOrConfig = tryCatch2v(getEnv, toError);

// tslint:disable typedef
export function getConfig() {
  return errorOrConfig;
}

// tslint:disable typedef
export function getConfigOrThrow() {
  return errorOrConfig.getOrElseL(error => {
    throw new Error(`Invalid configuration: ${error.message}`);
  });
}
