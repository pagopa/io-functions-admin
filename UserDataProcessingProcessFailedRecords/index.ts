import { Context } from "@azure/functions";
import { processFailedUserDataProcessing } from "./handler";

import * as express from "express";
import * as winston from "winston";

import { UserDataProcessingModel, USER_DATA_PROCESSING_COLLECTION_NAME } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";

import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { cosmosdbClient } from "../utils/cosmosdb";

import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

const userDataProcessingContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(USER_DATA_PROCESSING_COLLECTION_NAME);

const userDataProcessingModel = new UserDataProcessingModel(userDataProcessingContainer);

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
app.get(
  "/adm/user-data-processing/failed-records",
  processFailedUserDataProcessing(userDataProcessingModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

export const index = (
  context: Context,
  input: unknown
): void => {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
};
