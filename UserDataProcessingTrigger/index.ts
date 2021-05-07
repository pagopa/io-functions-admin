import { Context } from "@azure/functions";
import { createTableService } from "azure-storage";
import { getConfigOrThrow } from "../utils/config";
import {
  createTableIfNotExists,
  deleteTableEntity,
  insertTableEntity
} from "../utils/storage";
import { triggerHandler } from "./handler";

// configure log prefix
const logPrefix = "UserDataProcessingTrigger";

// prepare table storage utils
const config = getConfigOrThrow();
const connectionString = config.FailedUserDataProcessingStorageConnection;
const failedUserDataProcessingTable = config.FAILED_USER_DATA_PROCESSING_TABLE;
const tableService = createTableService(connectionString);

export const index = async (
  context: Context,
  input: unknown
): Promise<ReadonlyArray<string | void>> => {
  await createTableIfNotExists(tableService, failedUserDataProcessingTable)
    .mapLeft(_ => {
      context.log.verbose(
        `${logPrefix}|Failed to create storage table ${failedUserDataProcessingTable}`
      );
    })
    .run();

  const handler = triggerHandler(
    insertTableEntity(tableService, failedUserDataProcessingTable),
    deleteTableEntity(tableService, failedUserDataProcessingTable)
  );
  return handler(context, input);
};
