import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";

import { getConfigOrThrow } from "../utils/config";
import { GetSubscription } from "./handler";

const config = getConfigOrThrow();

const azureApimConfig = {
  apim: config.AZURE_APIM,
  apimResourceGroup: config.AZURE_APIM_RESOURCE_GROUP,
  subscriptionId: config.AZURE_SUBSCRIPTION_ID
};

// eslint-disable-next-line functional/no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.get("/adm/subscriptions/:subscriptionid", GetSubscription(azureApimConfig));

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
