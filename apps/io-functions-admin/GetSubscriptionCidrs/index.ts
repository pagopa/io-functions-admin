import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  SUBSCRIPTION_CIDRS_COLLECTION_NAME,
  SubscriptionCIDRsModel
} from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import express from "express";
import * as winston from "winston";

import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { GetSubscriptionCidrs } from "./handler";

const config = getConfigOrThrow();

const subscriptionCIDRsContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(SUBSCRIPTION_CIDRS_COLLECTION_NAME);

const subscriptionCIDRsModel = new SubscriptionCIDRsModel(
  subscriptionCIDRsContainer
);

// eslint-disable-next-line functional/no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
}) as unknown as winston.transport;
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.get(
  "/adm/subscriptions/:subscriptionid/cidrs",
  GetSubscriptionCidrs(subscriptionCIDRsModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler

function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
