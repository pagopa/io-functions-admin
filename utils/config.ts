import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

export type IConfig = ReturnType<typeof getConfig>;

export function getConfig() {
  return {
    COSMOSDB_NAME: getRequiredStringEnv("COSMOSDB_NAME"),
    COSMOSDB_URI: getRequiredStringEnv("COSMOSDB_URI"),
    COSMOSDB_KEY: getRequiredStringEnv("COSMOSDB_KEY"),
    SERVICE_PRINCIPAL_CLIENT_ID: getRequiredStringEnv(
      "SERVICE_PRINCIPAL_CLIENT_ID"
    ),
    SERVICE_PRINCIPAL_SECRET: getRequiredStringEnv("SERVICE_PRINCIPAL_SECRET"),
    SERVICE_PRINCIPAL_TENANT_ID: getRequiredStringEnv(
      "SERVICE_PRINCIPAL_TENANT_ID"
    ),
    AZURE_APIM: getRequiredStringEnv("AZURE_APIM"),
    AZURE_APIM_RESOURCE_GROUP: getRequiredStringEnv(
      "AZURE_APIM_RESOURCE_GROUP"
    ),
    AZURE_SUBSCRIPTION_ID: getRequiredStringEnv("AZURE_SUBSCRIPTION_ID"),
    ADB2C_CLIENT_ID: getRequiredStringEnv("ADB2C_CLIENT_ID"),
    ADB2C_CLIENT_KEY: getRequiredStringEnv("ADB2C_CLIENT_KEY"),
    ADB2C_TENANT_ID: getRequiredStringEnv("ADB2C_TENANT_ID"),
    MESSAGE_CONTAINER_NAME: getRequiredStringEnv("MESSAGE_CONTAINER_NAME"),
    UserDataBackupStorageConnection: getRequiredStringEnv(
      "UserDataBackupStorageConnection"
    ),
    StorageConnection: getRequiredStringEnv("StorageConnection"),
    USER_DATA_BACKUP_CONTAINER_NAME: getRequiredStringEnv(
      "USER_DATA_BACKUP_CONTAINER_NAME"
    ),
    UserDataArchiveStorageConnection: getRequiredStringEnv(
      "UserDataArchiveStorageConnection"
    ),
    USER_DATA_CONTAINER_NAME: getRequiredStringEnv("USER_DATA_CONTAINER_NAME"),
    MAIL_FROM: getRequiredStringEnv("MAIL_FROM"),

    PUBLIC_API_URL: getRequiredStringEnv("PUBLIC_API_URL"),
    PUBLIC_API_KEY: getRequiredStringEnv("PUBLIC_API_KEY"),
    PUBLIC_DOWNLOAD_BASE_URL: getRequiredStringEnv("PUBLIC_DOWNLOAD_BASE_URL"),
    SESSION_API_URL: getRequiredStringEnv("SESSION_API_URL"),
    SESSION_API_KEY: getRequiredStringEnv("SESSION_API_KEY"),
    SUBSCRIPTIONS_FEED_TABLE: getRequiredStringEnv("SUBSCRIPTIONS_FEED_TABLE"),
    LOGOS_URL: getRequiredStringEnv("LOGOS_URL"),
    USER_DATA_DELETE_DELAY_DAYS: getRequiredStringEnv(
      "USER_DATA_DELETE_DELAY_DAYS"
    ),

    // FIXME: email configuration values may be required or not depending on their values
    // We
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    MAIL_TRANSPORTS: process.env.MAIL_TRANSPORTS,
    MAILHOG_HOSTNAME: process.env.MAILHOG_HOSTNAME,
    MAILUP_SECRET: process.env.MAILUP_SECRET,
    MAILUP_USERNAME: process.env.MAILUP_USERNAME
  };
}
