import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import express from "express";
import * as winston from "winston";

import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { processFailedUserDataProcessing } from "./handler";

const config = getConfigOrThrow();

const userDataProcessingContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(USER_DATA_PROCESSING_COLLECTION_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  userDataProcessingContainer
);

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
  "/adm/user-data-processing/failed-records",
  processFailedUserDataProcessing(userDataProcessingModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

export const index = (context: Context, _: unknown): void => {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
};
