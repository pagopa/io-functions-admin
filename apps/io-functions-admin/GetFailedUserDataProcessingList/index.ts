import { Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { createTableService } from "azure-storage";
import express from "express";
import * as winston from "winston";

import { getConfigOrThrow } from "../utils/config";
import { GetFailedUserDataProcessingList } from "./handler";

/**
 * Table service
 */
const config = getConfigOrThrow();
const storageConnectionString =
  config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(storageConnectionString);

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
  "/adm/user-data-processing/failed/:choice",
  GetFailedUserDataProcessingList(tableService, failedUserDataProcessingTable)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
const httpStart = (context: Context): void => {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
