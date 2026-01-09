import {
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";

import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";
import { createUserDataProcessingCheckLastStatusActivityHandler } from "./handler";

const config = getConfigOrThrow();

const userDataProcessingContainer = cosmosdbClient
  .database(config.COSMOSDB_NAME)
  .container(USER_DATA_PROCESSING_COLLECTION_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  userDataProcessingContainer
);

const activityFunctionHandler =
  createUserDataProcessingCheckLastStatusActivityHandler(
    userDataProcessingModel
  );

export default activityFunctionHandler;
