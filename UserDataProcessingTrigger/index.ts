import { Context } from "@azure/functions";
import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import { insertTableEntity, deleteTableEntity } from "../utils/storage";
import { triggerHandler } from "./handler";

// prepare table storage utils
const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(connectionString);

export const index = async (
  context: Context,
  input: unknown
): Promise<ReadonlyArray<string | void>> => {
  const handler = triggerHandler(
    insertTableEntity(tableService,failedUserDataProcessingTable),
    deleteTableEntity(tableService, failedUserDataProcessingTable)
  );
  return handler(context, input);
};
