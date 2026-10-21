/**
 * Use a singleton CosmosDB client across functions.
 */
import type { TokenCredential } from "@azure/core-auth";

import { CosmosClient } from "@azure/cosmos";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";

import { getConfigOrThrow } from "./config";

const config = getConfigOrThrow();
const cosmosDbUri = config.COSMOSDB_URI;
const cosmosDbName = config.COSMOSDB_NAME;

export const createCosmosDbCredential = (
  isProduction: boolean
): TokenCredential =>
  isProduction ? new ManagedIdentityCredential() : new AzureCliCredential();

export const createCosmosDbClient = (
  endpoint: string,
  aadCredentials: TokenCredential
): CosmosClient => new CosmosClient({ aadCredentials, endpoint });

export const cosmosdbClient = createCosmosDbClient(
  cosmosDbUri,
  createCosmosDbCredential(config.isProduction)
);

export const cosmosdbInstance = cosmosdbClient.database(cosmosDbName);
