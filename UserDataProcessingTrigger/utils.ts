import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { deleteTableEntity, insertTableEntity } from "../utils/storage";

// prepare table storage utils
const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;

const tableService = createTableService(connectionString);

export const addFailedUserDataProcessing = insertTableEntity(
  tableService,
  failedUserDataProcessingTable
);

export const removeFailedUserDataProcessing = deleteTableEntity(
  tableService,
  failedUserDataProcessingTable
);

export type InsertTableEntityType = typeof addFailedUserDataProcessing;

export type DeleteTableEntityType = typeof removeFailedUserDataProcessing;

export const createFailedUserDataProcessingTableIfNotExists = (): void =>
  tableService.createTableIfNotExists(failedUserDataProcessingTable, () => 0);
