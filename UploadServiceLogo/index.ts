import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import {
  SERVICE_COLLECTION_NAME,
  ServiceModel
} from "io-functions-commons/dist/src/models/service";
import { secureExpressApp } from "io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { UploadServiceLogo } from "./handler";

import { createBlobService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";

import * as bodyParser from "body-parser";

const config = getConfigOrThrow();

const database = cosmosdbClient.database(config.COSMOSDB_NAME);
const logosUrl = config.LOGOS_URL;

const servicesContainer = database.container(SERVICE_COLLECTION_NAME);

const serviceModel = new ServiceModel(servicesContainer);

const blobService = createBlobService(config.AssetsStorageConnection);

// tslint:disable-next-line: no-let
let logger: Context["log"] | undefined;
const contextTransport = new AzureContextTransport(() => logger, {
  level: "debug"
});
winston.add(contextTransport);

// Setup Express
const app = express();
secureExpressApp(app);

// Setup max body size
app.use(bodyParser.json({ limit: "5mb" }));

// Add express route
app.put(
  "/adm/services/:serviceid/logo",
  UploadServiceLogo(serviceModel, blobService, logosUrl)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
