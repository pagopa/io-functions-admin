import {
  SERVICE_PREFERENCES_COLLECTION_NAME,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { GetServicesPreferencesActivityHandler } from "./handler";

const servicePreferencesModel = new ServicesPreferencesModel(
  cosmosdbInstance.container(SERVICE_PREFERENCES_COLLECTION_NAME),
  SERVICE_PREFERENCES_COLLECTION_NAME
);

const activityFunctionHandler = GetServicesPreferencesActivityHandler(
  servicePreferencesModel
);

export default activityFunctionHandler;
