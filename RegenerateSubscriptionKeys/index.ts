import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { getConfigOrThrow } from "../utils/config";
import { RegenerateSubscriptionKeys } from "./handler";

const config = getConfigOrThrow();

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
  "/adm/services/:serviceid/keys",
  RegenerateSubscriptionKeys(servicePrincipalCreds, azureApimConfig)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
