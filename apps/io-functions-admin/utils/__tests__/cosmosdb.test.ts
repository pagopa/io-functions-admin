import { describe, expect, it, vi } from "vitest";

const cosmosMocks = vi.hoisted(() => ({
  azureCliCredential: { getToken: vi.fn() },
  clientOptions: vi.fn(),
  config: {
    COSMOSDB_KEY: "legacy-key",
    COSMOSDB_NAME: "database",
    COSMOSDB_URI: "https://cosmos.example/",
    isProduction: false
  },
  database: vi.fn(() => ({})),
  managedIdentityCredential: { getToken: vi.fn() }
}));

vi.mock("@azure/cosmos", () => ({
  CosmosClient: vi.fn().mockImplementation((options: unknown) => {
    cosmosMocks.clientOptions(options);
    return { database: cosmosMocks.database };
  })
}));

vi.mock("@azure/identity", () => ({
  AzureCliCredential: vi.fn(() => cosmosMocks.azureCliCredential),
  ManagedIdentityCredential: vi.fn(() => cosmosMocks.managedIdentityCredential)
}));

vi.mock("../config", () => ({
  getConfigOrThrow: () => cosmosMocks.config
}));

import { createCosmosDbClient, createCosmosDbCredential } from "../cosmosdb";

describe("CosmosDB client", () => {
  it("uses an AAD credential and ignores an existing Cosmos key", () => {
    expect(cosmosMocks.clientOptions).toHaveBeenCalledWith({
      aadCredentials: cosmosMocks.azureCliCredential,
      endpoint: cosmosMocks.config.COSMOSDB_URI
    });
  });

  it("uses the SystemAssigned identity in production", () => {
    expect(createCosmosDbCredential(true)).toBe(
      cosmosMocks.managedIdentityCredential
    );
  });

  it("uses the Azure CLI credential outside production", () => {
    expect(createCosmosDbCredential(false)).toBe(
      cosmosMocks.azureCliCredential
    );
  });

  it("accepts an explicitly injected credential", () => {
    const credential = createCosmosDbCredential(false);
    createCosmosDbClient("https://injected.example/", credential);

    expect(cosmosMocks.clientOptions).toHaveBeenLastCalledWith({
      aadCredentials: credential,
      endpoint: "https://injected.example/"
    });
  });
});
