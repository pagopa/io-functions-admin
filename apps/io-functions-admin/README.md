# IO Functions for administration of the platform

This project implements the APIs to enable the administration functionalities required by the the IO platform. The APIs are called by the Azure API Management developer portal and other IO related projects.
The implementation is based on the Azure Functions v4 runtime.

#### Required environment variables

The table lists some of the environment variables needed by the application;
they may be customized as needed.

Blob Storage uses endpoint URLs and the slot's system-assigned identity in Azure.
Local runs use `AzureCliCredential`; authenticate with `az login` and use an
account with the required data-plane RBAC roles.
The profile-sanitization Queue binding uses `CitizenAuthQueueConnection` with
the slot's system-assigned identity in Azure. For local runs, set its
`queueServiceUri` and authenticate with `az login`; do not set a connection
string under the exact `CitizenAuthQueueConnection` name.

| Variable name                           | Description                                                                                   | type   |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| STORAGE_BLOB_ENDPOINT                   | Blob endpoint for message contents                                                            | string |
| ASSETS_STORAGE_BLOB_ENDPOINT            | Blob endpoint for service and organization logos                                              | string |
| USER_DATA_BACKUP_STORAGE_BLOB_ENDPOINT  | Blob endpoint for GDPR delete backups                                                         | string |
| USER_DATA_ARCHIVE_STORAGE_BLOB_ENDPOINT | Blob endpoint for GDPR download archives                                                      | string |
| COSMOSDB_IDENTITY\_\_accountEndpoint    | CosmosDB endpoint used by the trigger (local runs use Azure CLI authentication)               | string |
| COSMOSDB_URI                            | CosmosDB endpoint used by the application client                                              | string |
| COSMOSDB_NAME                           | CosmosDB database name                                                                        | string |
| LOGOS_URL                               | The url of the service logos storage                                                          | string |
| SERVICE_PRINCIPAL_CLIENT_ID             | The service principal name used to get the token credentials to connect to the APIM           | string |
| SERVICE_PRINCIPAL_SECRET                | The service principal secret used to get the token credentials to connect to the APIM         | string |
| SERVICE_PRINCIPAL_TENANT_ID             | The service principal tenant id used to get the token credentials to connect to the APIM      | string |
| AZURE_APIM                              | The name of the API Management service used to get the subscriptions                          | string |
| AZURE_APIM_HOST                         | The host name of the API Management service                                                   | string |
| AZURE_APIM_RESOURCE_GROUP               | The name of the resource group used to get the subscriptions                                  | string |
| AZURE_SUBSCRIPTION_ID                   | Credentials which identify the Azure subscription, used to init the APIM client               | string |
| USER_DATA_CONTAINER_NAME                | Name of the container on which zip files with usr data are stored                             | string |
| MESSAGE_CONTAINER_NAME                  | Name of the container which stores message content                                            | string |
| PUBLIC_API_URL                          | Internal URL of the API management used to send messages                                      | string |
| PUBLIC_API_KEY                          | GDPR service access key for the message API                                                   | string |
| PUBLIC_DOWNLOAD_BASE_URL                | Public URL of user's data zip bundle storage                                                  | string |
| SESSION_API_URL                         | Internal URL of the BACKEND API used to handle session lock/unlock requests                   | string |
| SESSION_API_KEY                         | service access key for the session API                                                        | string |
| USER_DATA_BACKUP_CONTAINER_NAME         | Name of the storage container in which user data is backuped before being permanently deleted | string |
| USER_DATA_DELETE_DELAY_DAYS             | How many days to wait when a user asks for cancellation before effectively delete her data    | number |
| MAIL_FROM                               | Address from which email are sent                                                             | string |
| SENDGRID_API_KEY                        | If provided, SendGrid will be used                                                            | string |
| MAILUP_USERNAME                         | If using MailUp, the username                                                                 | string |
| MAILUP_SECRET                           | If using MailUp, the secret                                                                   | string |
| MAILHOG_HOSTNAME                        | Required on development, the host name of the MailHog SMTP server                             | string |
| API_STORAGE_TABLE_ENDPOINT              | Table endpoint for subscription feeds and failed user-data processing                         | string |
| SESSION_STORAGE_TABLE_ENDPOINT          | Table endpoint for locked profiles and profile emails                                         | string |
| CitizenAuthQueueConnection__queueServiceUri | Queue endpoint for the profile-email sanitization trigger                                  | string |
| SUBSCRIPTIONS_FEED_TABLE                | Table name for the Subscriptions Feed in the storage                                          | string |
| GET_USERS_PAGE_SIZE                     | Number of elements to be fetched and returned on GetUsers Api invoke (Default=100)            | number |

#### Feature flags

This flags enable/disable some features and are expected to be boolean. To set them true, assign them the literal value `1`

| Variable name                | Description                                       | default |
| ---------------------------- | ------------------------------------------------- | ------- |
| FF_ENABLE_USER_DATA_DOWNLOAD | Users' GDPR data access claims are processed      | true    |
| FF_ENABLE_USER_DATA_DELETE   | Users' GDPR right to erasure claims are processed | true    |

#### GDPR archive storage reliability

The Blob SDK and its compatibility client must resolve to one compatible
`@azure/core-client` version. Duplicate versions can cause Blob requests to be
serialized without their body or required headers and can prevent error
responses from being handled correctly. After changing Azure SDK dependencies,
run `yarn dedupe @azure/core-client` from the repository root and commit the
updated `yarn.lock`; do not force older versions with package resolutions.

The shared Blob pipeline also treats HTTP 403 responses to `PUT` operations as
write failures, including block staging and block-list commits. A failed GDPR
archive upload remains `FAILED` and does not send a download message or mark
the request `CLOSED`. Other HTTP methods and the SDK's transient retry behavior
are unchanged.

To run the focused regression tests:

```sh
yarn workspace io-functions-admin test ExtractUserDataActivity/__tests__/blob_upload.test.ts ExtractUserDataActivity/__tests__/handler.test.ts UserDataDownloadOrchestrator/__tests__/handler.test.ts utils/__tests__/blob_storage.test.ts
```

The Blob SDK integration tests use a local HTTPS server and `openssl` to create
and clean up a temporary certificate; they do not access Azure.

Do not automatically replay completed Durable instances when reconciling
requests affected by the earlier behavior. Verify each archive and use the
supported new-request or recovery path to create a consistent archive and
notification. A regenerated archive has a new password, so do not associate it
with an older download message.
