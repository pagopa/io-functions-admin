import { cosmosdbClient } from "../utils/cosmosdb";

import { getConfigOrThrow } from "../utils/config";
import { setUserDataProcessingReasonActivityHandler } from "./handler";

import {
    USER_DATA_PROCESSING_COLLECTION_NAME,
    UserDataProcessingModel
  } from "io-functions-commons/dist/src/models/user_data_processing";
  

const config = getConfigOrThrow();

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

const activityFunctionHandler = setUserDataProcessingReasonActivityHandler(
  userDataProcessingModel
);

export default activityFunctionHandler;