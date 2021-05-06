import { Context } from "@azure/functions";
import { triggerHandler } from "./handler";
import {
  addFailedUserDataProcessing,
  removeFailedUserDataProcessing,
  createFailedUserDataProcessingTableIfNotExists
} from "./utils";

createFailedUserDataProcessingTableIfNotExists();

export const index = (
  context: Context,
  input: unknown
): Promise<ReadonlyArray<string | void>> => {
  const handler = triggerHandler(
    addFailedUserDataProcessing,
    removeFailedUserDataProcessing
  );
  return handler(context, input);
};
