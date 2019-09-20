import { createBlobService } from "azure-storage";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

import { getUpdateVisibleServicesActivityHandler } from "./handler";

const storageConnectionString = getRequiredStringEnv("StorageConnection");
const blobService = createBlobService(storageConnectionString);

const activityFunctionHandler = getUpdateVisibleServicesActivityHandler(
  blobService
);

export default activityFunctionHandler;
