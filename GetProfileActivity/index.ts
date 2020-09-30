import { cosmosdbClient } from "../utils/cosmosdb";

import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "io-functions-commons/dist/src/models/profile";
import { getConfigOrThrow } from "../utils/config";
import { createGetProfileActivityHandler } from "./handler";

const config = getConfigOrThrow();
const cosmosDbName = config.COSMOSDB_NAME;
const database = cosmosdbClient.database(cosmosDbName);

const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

const activityFunctionHandler = createGetProfileActivityHandler(profileModel);

export default activityFunctionHandler;
