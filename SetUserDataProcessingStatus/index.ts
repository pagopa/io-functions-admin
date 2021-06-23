import * as express from "express";
import * as winston from "winston";

import { Context } from "@azure/functions";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import {
  UserDataProcessingModel,
  USER_DATA_PROCESSING_COLLECTION_NAME
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { setUserDataProcessingStatus } from "./handler";

const config = getConfigOrThrow();

/**
 * UserDataProcessing collection
 */
const userDataProcessingContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(USER_DATA_PROCESSING_COLLECTION_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  userDataProcessingContainer
);

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
app.put(
  "/adm/user-data-processing/:choice/:fiscalCode/status/:newStatus",
  setUserDataProcessingStatus(userDataProcessingModel)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
const httpStart = (context: Context): void => {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
