import { createBlobService } from "azure-storage";
import { getConfig } from "../utils/config";
import { getUpdateVisibleServicesActivityHandler } from "./handler";

const config = getConfig();
const storageConnectionString = config.StorageConnection;
const blobService = createBlobService(storageConnectionString);

const activityFunctionHandler = getUpdateVisibleServicesActivityHandler(
  blobService
);

export default activityFunctionHandler;
