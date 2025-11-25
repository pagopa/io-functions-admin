import { createTableService } from "azure-storage";

import { getConfigOrThrow } from "../utils/config";
import { IsFailedUserDataProcessing } from "./handler";

/**
 * Table service
 */
const config = getConfigOrThrow();
const storageConnectionString =
  config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(storageConnectionString);

const activityFunctionHandler = IsFailedUserDataProcessing(
  tableService,
  failedUserDataProcessingTable
);

export default activityFunctionHandler;
