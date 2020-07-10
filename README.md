# IO Functions for administration of the platform

This project implements the APIs to enable the administration functionalities required by the the IO platform. The APIs are called by the Azure API Management developer portal and other IO related projects.
The implementation is based on the Azure Functions v2 runtime.

#### Required environment variables

The table lists some of the environment variables needed by the application;
they may be customized as needed.

| Variable name               | Description                                                                                      | type   |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------ |
| StorageConnection           | Storage connection string to store computed visible-service.json (retrieved by io-functions-app) | string |
| COSMOSDB_URI                | CosmosDB connection URI                                                                          | string |
| COSMOSDB_KEY                | CosmoDB connection key                                                                           | string |
| COSMOSDB_NAME               | CosmosDB database name                                                                           | string |
| LOGOS_URL                   | The url of the service logos storage                                                             | string |
| AssetsStorageConnection     | The connection string used to connect to Azure Blob Storage containing the service cache         | string |
| SERVICE_PRINCIPAL_CLIENT_ID | The service principal name used to get the token credentials to connect to the APIM              | string |
| SERVICE_PRINCIPAL_SECRET    | The service principal secret used to get the token credentials to connect to the APIM            | string |
| SERVICE_PRINCIPAL_TENANT_ID | The service principal tenant id used to get the token credentials to connect to the APIM         | string |
| ADB2C_CLIENT_ID             | The application client id used to get the token credentials to connect to the ADB2C              | string |
| ADB2C_CLIENT_KEY            | The application secret used to get the token credentials to connect to the ADB2C                 | string |
| ADB2C_TENANT_ID             | The ADB2C tenant id                                                                              | string |
| AZURE_APIM                  | The name of the API Management service used to get the subscriptions                             | string |
| AZURE_APIM_HOST             | The host name of the API Management service                                                      | string |
| AZURE_APIM_RESOURCE_GROUP   | The name of the resource group used to get the subscriptions                                     | string |
| AZURE_SUBSCRIPTION_ID       | Credentials which identify the Azure subscription, used to init the APIM  client                 | string |
| UserDataArchiveStorageConnection | Storage connection string to store zip file for user to download their data | string |
| USER_DATA_CONTAINER_NAME | Name of the container on which zip files with usr data are stored | string |
| MessageContentStorageConnection | Storage connection string o where message content is stored | string |
| MESSAGE_CONTAINER_NAME | name of the container which stores message content | string |
| PUBLIC_API_URL | url of the public api | string |
| PUBLIC_API_KEY | API Managment access key for public api | string |
| PUBLIC_DOWNLOAD_BASE_URL | Url of user data zip bundle storage | string |

