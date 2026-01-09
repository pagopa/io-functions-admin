import { Context } from "@azure/functions";
import { createTableService } from "azure-storage";

import { getConfigOrThrow } from "../utils/config";
import { deleteTableEntity, insertTableEntity } from "../utils/storage";
import { triggerHandler } from "./handler";

// prepare table storage utils
const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(connectionString);

export const index = async (
  context: Context,
  input: unknown
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
): Promise<readonly (string | void)[]> => {
  const handler = triggerHandler(
    insertTableEntity(tableService, failedUserDataProcessingTable),
    deleteTableEntity(tableService, failedUserDataProcessingTable)
  );
  return handler(context, input);
};
