import { createBlobService } from "azure-storage";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getUpdateMunicipalitiesHandler } from "./handler";

const storageConnectionString = getRequiredStringEnv("StorageConnection");
const blobService = createBlobService(storageConnectionString);

const functionHandler = getUpdateMunicipalitiesHandler(blobService);

export default functionHandler;
