# IO Functions for administration of the platform

This project implements the APIs to enable the administration functionalities required by the the IO platform. The APIs are called by the Azure API Management developer portal and other IO related projects.
The implementation is based on the Azure Functions v2 runtime.

#### Required environment variables

The table lists some of the environment variables needed by the application;
they may be customized as needed.

| Variable name                          | Description                                                                       | type    |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------- |
| SERVICE_LOGOS_HOST                     | The host name of the service logos storage                                        | string  |
| StorageConnection                      | The connectiong string used to connect to Azure Storage services                  | string  |