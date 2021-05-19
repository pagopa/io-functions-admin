import * as express from "express";
import * as winston from "winston";

import { Context } from "@azure/functions";
import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { GetFailedUserDataProcessing } from "./handler";

/**
 * Table service
 */
const config = getConfigOrThrow();
const storageConnectionString =
  config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(storageConnectionString);

/**
 * Service container
 */
const servicesContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(SERVICE_COLLECTION_NAME);

const serviceModel = new ServiceModel(servicesContainer);

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
  "/adm/user-data-processing/failed/:choice/:fiscalCode",
  GetFailedUserDataProcessing(
    serviceModel,
    tableService,
    failedUserDataProcessingTable
  )
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
const httpStart = (context: Context): void => {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
