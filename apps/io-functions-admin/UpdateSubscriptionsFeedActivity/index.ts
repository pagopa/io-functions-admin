import { AzureFunction, Context } from "@azure/functions";
import { createTableService } from "azure-storage";

import { getConfigOrThrow } from "../utils/config";
import { updateSubscriptionFeed } from "./handler";

const config = getConfigOrThrow();

const tableService = createTableService(
  config.SubscriptionFeedStorageConnection
);

// When the function starts, attempt to create the table if it does not exist
// Note that we cannot log anything just yet since we don't have a Context
tableService.createTableIfNotExists(config.SUBSCRIPTIONS_FEED_TABLE, () => 0);

const activityFunction: AzureFunction = async (
  context: Context,
  rawInput: unknown
): Promise<string> =>
  updateSubscriptionFeed(
    context,
    rawInput,
    tableService,
    config.SUBSCRIPTIONS_FEED_TABLE
  );
export default activityFunction;
