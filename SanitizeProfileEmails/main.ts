import * as t from "io-ts";

import * as H from "@pagopa/handler-kit";
import { azureFunction } from "@pagopa/handler-kit-azure-func";

import {
  PROFILE_COLLECTION_NAME,
  ProfileModel
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { getConfigOrThrow } from "../utils/config";
import { cosmosdbInstance } from "../utils/cosmosdb";

import { ProfileToSanitize, sanitizeProfileEmails } from "./index";

getConfigOrThrow();

const profilesContainer = cosmosdbInstance.container(PROFILE_COLLECTION_NAME);

const profileModel = new ProfileModel(profilesContainer);

const createSanitizeProfileEmailsFunction = azureFunction(
  H.of(sanitizeProfileEmails)
);

export default createSanitizeProfileEmailsFunction({
  inputDecoder: t.array(ProfileToSanitize),
  profileModel
});
