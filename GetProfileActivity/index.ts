import { cosmosdbClient } from "../utils/cosmosdb";

import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import { getConfigOrThrow } from "../utils/config";
import { createGetProfileActivityHandler } from "./handler";

const config = getConfigOrThrow();

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const profileModel = new ProfileModel(
  database.container(PROFILE_COLLECTION_NAME)
);

const activityFunctionHandler = createGetProfileActivityHandler(profileModel);

export default activityFunctionHandler;
