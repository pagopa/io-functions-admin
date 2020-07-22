/**
 * Use a singleton CosmosDB client across functions.
 */
import { CosmosClient } from "@azure/cosmos";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

const cosmosDbUri = getRequiredStringEnv("COSMOSDB_URI");
const masterKey = getRequiredStringEnv("COSMOSDB_KEY");

export const cosmosdbClient = new CosmosClient({
  endpoint: cosmosDbUri,
  key: masterKey
});
