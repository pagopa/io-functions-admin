# IO Functions for administration of the platform

This project implements the APIs to enable the administration functionalities required by the the IO platform. The APIs are called by the Azure API Management developer portal and other IO related projects.
The implementation is based on the Azure Functions v2 runtime.

#### Required environment variables

The table lists some of the environment variables needed by the application;
they may be customized as needed.

| Variable name                    | Description                                                                                      | type   |
|----------------------------------|--------------------------------------------------------------------------------------------------|--------|
| StorageConnection                | Storage connection string to store computed visible-service.json (retrieved by io-functions-app) | string |
| COSMOSDB_CONNECTION_STRING       | CosmosDB connection string (needed in triggers)                                                  | string |
| COSMOSDB_URI                     | CosmosDB connection URI                                                                          | string |
| COSMOSDB_KEY                     | CosmosDB connection key                                                                          | string |
| COSMOSDB_NAME                    | CosmosDB database name                                                                           | string |
| LOGOS_URL                        | The url of the service logos storage                                                             | string |
| AssetsStorageConnection          | The connection string used to connect to Azure Blob Storage containing the service cache         | string |
| SERVICE_PRINCIPAL_CLIENT_ID      | The service principal name used to get the token credentials to connect to the APIM              | string |
| SERVICE_PRINCIPAL_SECRET         | The service principal secret used to get the token credentials to connect to the APIM            | string |
| SERVICE_PRINCIPAL_TENANT_ID      | The service principal tenant id used to get the token credentials to connect to the APIM         | string |
| ADB2C_CLIENT_ID                  | The application client id used to get the token credentials to connect to the ADB2C              | string |
| ADB2C_CLIENT_KEY                 | The application secret used to get the token credentials to connect to the ADB2C                 | string |
| ADB2C_TENANT_ID                  | The ADB2C tenant id                                                                              | string |
| AZURE_APIM                       | The name of the API Management service used to get the subscriptions                             | string |
| AZURE_APIM_HOST                  | The host name of the API Management service                                                      | string |
| AZURE_APIM_RESOURCE_GROUP        | The name of the resource group used to get the subscriptions                                     | string |
| AZURE_SUBSCRIPTION_ID            | Credentials which identify the Azure subscription, used to init the APIM  client                 | string |
| UserDataArchiveStorageConnection | Storage connection string to store zip file for user to download their data                      | string |
| USER_DATA_CONTAINER_NAME         | Name of the container on which zip files with usr data are stored                                | string |
| MESSAGE_CONTAINER_NAME           | Name of the container which stores message content                                               | string |
| PUBLIC_API_URL                   | Internal URL of the API management used to send messages                                         | string |
| PUBLIC_API_KEY                   | GDPR service access key for the message API                                                      | string |
| PUBLIC_DOWNLOAD_BASE_URL         | Public URL of user's data zip bundle storage                                                     | string |
| SESSION_API_URL                  | Internal URL of the BACKEND API used to handle session lock/unlock requests                      | string |
| SESSION_API_KEY                  | service access key for the session API                                                           | string |
| USER_DATA_BACKUP_CONTAINER_NAME  | Name of the storage container in which user data is backuped before being permanently deleted    | string |
| USER_DATA_DELETE_DELAY_DAYS      | How many days to wait when a user asks for cancellation before effectively delete her data       | number |
| UserDataBackupStorageConnection  | Storage connection string for GDPR user data storage                                             | string |
| MAIL_FROM                        | Address from which email are sent                                                                | string |
| SENDGRID_API_KEY                 | If provided, SendGrid will be used                                                               | string |
| MAILUP_USERNAME                  | If using MailUp, the username                                                                    | string |
| MAILUP_SECRET                    | If using MailUp, the secret                                                                      | string |
| MAILHOG_HOSTNAME                 | Required on development, the host name of the MailHog SMTP server                                | string |
| SubscriptionFeedStorageConnection| Storage connection string for subscription feed                                                  | string |
| SUBSCRIPTIONS_FEED_TABLE         | Table name for the Subscriptions Feed in the storage                                             | string |  


#### Feature flags

This flags enable/disable some features and are expected to be boolean. To set them true, assign them the literal value `1`

| Variable name                | Description                                       | default |
|------------------------------|---------------------------------------------------|---------|
| FF_ENABLE_USER_DATA_DOWNLOAD | Users' GDPR data access claims are processed      | true    |
| FF_ENABLE_USER_DATA_DELETE   | Users' GDPR right to erasure claims are processed | true    |


test pr
