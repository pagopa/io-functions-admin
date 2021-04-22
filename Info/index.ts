import { AzureFunction, Context } from "@azure/functions";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import * as express from "express";
import createAzureFunctionHandler from "io-functions-express/dist/src/createAzureFunctionsHandler";
import { Info } from "./handler";

// Setup Express
const app = express();
secureExpressApp(app);

// Add express route
app.get("/info", Info());

const azureFunctionHandler = createAzureFunctionHandler(app);

const httpStart: AzureFunction = (context: Context): void => {
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
