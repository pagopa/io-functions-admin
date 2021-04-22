import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { getRequiredStringEnv } from "@pagopa/io-functions-commons/dist/src/utils/env";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { getConfigOrThrow } from "../utils/config";
import { GetUser } from "./handler";

const config = getConfigOrThrow();

const adb2cCreds = {
  clientId: getRequiredStringEnv("ADB2C_CLIENT_ID"),
  secret: getRequiredStringEnv("ADB2C_CLIENT_KEY"),
  tenantId: getRequiredStringEnv("ADB2C_TENANT_ID")
};
const servicePrincipalCreds = {
  clientId: config.SERVICE_PRINCIPAL_CLIENT_ID,
  secret: config.SERVICE_PRINCIPAL_SECRET,
  tenantId: config.SERVICE_PRINCIPAL_TENANT_ID
};
const azureApimConfig = {
  apim: config.AZURE_APIM,
  apimResourceGroup: config.AZURE_APIM_RESOURCE_GROUP,
  subscriptionId: config.AZURE_SUBSCRIPTION_ID
};

const adb2cTokenAttributeName = getRequiredStringEnv(
  "ADB2C_TOKEN_ATTRIBUTE_NAME"
);

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
  GetUser(
    adb2cCreds,
    servicePrincipalCreds,
    azureApimConfig,
    adb2cTokenAttributeName
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
