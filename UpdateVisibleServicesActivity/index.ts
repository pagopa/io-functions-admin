import { createBlobService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { getUpdateVisibleServicesActivityHandler } from "./handler";

const config = getConfigOrThrow();
const storageConnectionString = config.StorageConnection;
const blobService = createBlobService(storageConnectionString);

const activityFunctionHandler = getUpdateVisibleServicesActivityHandler(
  blobService
);

export default activityFunctionHandler;
