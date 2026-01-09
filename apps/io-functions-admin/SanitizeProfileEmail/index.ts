import * as H from "@pagopa/handler-kit";
import { azureFunction } from "@pagopa/handler-kit-azure-func";
import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { initTelemetryClient } from "../utils/appinsights";
import { cosmosdbInstance } from "../utils/cosmosdb";
import { ProfileToSanitize, sanitizeProfileEmail } from "./handler";

const profilesContainer = cosmosdbInstance.container(PROFILE_COLLECTION_NAME);

const profileModel = new ProfileModel(profilesContainer);

const createSanitizeProfileEmailsFunction = azureFunction(
  H.of(sanitizeProfileEmail)
);

export default createSanitizeProfileEmailsFunction({
  inputDecoder: ProfileToSanitize,
  profileModel,
  telemetryClient: initTelemetryClient()
});
