import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { DocumentClient as DocumentDBClient } from "documentdb";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { UpdateUserGroup } from "./handler";

const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const cosmosDbKey = getRequiredStringEnv("COSMOSDB_KEY");
const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);
const servicesCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  SERVICE_COLLECTION_NAME
);

const documentClient = new DocumentDBClient(cosmosDbUri, {
  masterKey: cosmosDbKey
});

const serviceModel = new ServiceModel(documentClient, servicesCollectionUrl);

const servicePrincipalCreds = {
  clientId: getRequiredStringEnv("SERVICE_PRINCIPAL_CLIENT_ID"),
  secret: getRequiredStringEnv("SERVICE_PRINCIPAL_SECRET"),
  tenantId: getRequiredStringEnv("SERVICE_PRINCIPAL_TENANT_ID")
};
const azureApimConfig = {
  apim: getRequiredStringEnv("AZURE_APIM"),
  apimResourceGroup: getRequiredStringEnv("AZURE_APIM_RESOURCE_GROUP"),
  subscriptionId: getRequiredStringEnv("AZURE_SUBSCRIPTION_ID")
};

// tslint:disable-next-line: no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.put(
  "/adm/users/:email/groups",
  UpdateUserGroup(serviceModel, servicePrincipalCreds, azureApimConfig)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
