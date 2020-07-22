import {
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { cosmosdbClient } from "../utils/cosmosdb";

import { createSetUserDataProcessingStatusActivityHandler } from "./handler";

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const database = cosmosdbClient.database(cosmosDbName);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

const activityFunctionHandler = createSetUserDataProcessingStatusActivityHandler(
  userDataProcessingModel
);

export default activityFunctionHandler;
