import {
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";

import * as documentDbUtils from "io-functions-commons/dist/src/utils/documentdb";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { documentClient } from "../utils/cosmosdb";

import { createSetUserDataProcessingStatusActivityHandler } from "./handler";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");

const documentDbDatabaseUrl = documentDbUtils.getDatabaseUri(cosmosDbName);
const userDataProcessingsCollectionUrl = documentDbUtils.getCollectionUri(
  documentDbDatabaseUrl,
  USER_DATA_PROCESSING_COLLECTION_NAME
);

const userDataProcessingModel = new UserDataProcessingModel(
  documentClient,
  userDataProcessingsCollectionUrl
);

const activityFunctionHandler = createSetUserDataProcessingStatusActivityHandler(
  userDataProcessingModel
);

export default activityFunctionHandler;
