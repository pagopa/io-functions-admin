import { Context } from "@azure/functions";

import * as express from "express";
import * as winston from "winston";

import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { AzureContextTransport } from "@pagopa/io-functions-commons/dist/src/utils/logging";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";

import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";

import { UploadOrganizationLogo } from "./handler";

import { createBlobService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";

import * as bodyParser from "body-parser";

const config = getConfigOrThrow();
const logosUrl = config.LOGOS_URL;

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
  "/adm/organizations/:organizationfiscalcode/logo",
  UploadOrganizationLogo(blobService, logosUrl)
);

const azureFunctionHandler = createAzureFunctionHandler(app);

// Binds the express app to an Azure Function handler
function httpStart(context: Context): void {
  logger = context.log;
  setAppContext(app, context);
  azureFunctionHandler(context);
}

export default httpStart;
