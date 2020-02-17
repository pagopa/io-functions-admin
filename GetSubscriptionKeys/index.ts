import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { GetSubscriptionKeys, ITokenAndCredentials } from "./handler";

// tslint:disable-next-line: no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Global var needed to cache the
// API management access token between calls
// tslint:disable-next-line: no-let prefer-const
let tokenCreds: ITokenAndCredentials;

// Add express route
app.get("/adm/services/:serviceid/keys", GetSubscriptionKeys(tokenCreds));

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
