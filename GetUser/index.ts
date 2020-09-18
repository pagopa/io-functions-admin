import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { GetUser } from "./handler";

const adb2cCreds = {
  clientId: getRequiredStringEnv("ADB2C_CLIENT_ID"),
  secret: getRequiredStringEnv("ADB2C_CLIENT_KEY"),
  tenantId: getRequiredStringEnv("ADB2C_TENANT_ID")
};
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
app.get(
  "/adm/users/:email",
  GetUser(adb2cCreds, servicePrincipalCreds, azureApimConfig)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
