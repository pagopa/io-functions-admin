import { TableClient } from "@azure/data-tables";
import { InvocationContext } from "@azure/functions";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/v2/ServiceId";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { context as contextMock } from "../../__mocks__/durable-functions";
// eslint-disable-next-line vitest/no-mocks-import
import {
  aFiscalCode,
  aRetrievedServicePreferences
} from "../../__mocks__/mocks";
import { Input, updateSubscriptionFeed } from "../handler";

const aServiceId = "aServiceId" as ServiceId;

const insertEntityMock = vi.fn(() => Promise.resolve({}));

const deleteEntityMock = vi.fn(() => Promise.resolve({}));

const tableClientMock = {
  createEntity: insertEntityMock,
  deleteEntity: deleteEntityMock
} as unknown as TableClient;

const today = new Date();

describe("UpdateSubscriptionsFeedActivity - Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given a subscribed service input, When service has already been unsubscribed today, Then the unsubscribe feed must be deleted", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      serviceId: aServiceId,
      subscriptionKind: "SERVICE",
      updatedAt: today.getTime(),
      version: 1
    };

    const result = await updateSubscriptionFeed(
      input,
      contextMock as unknown as InvocationContext,
      tableClientMock
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      "S-" + today.toISOString().substring(0, 10) + "-aServiceId-U",
      expect.any(String)
    );

    expect(insertEntityMock).not.toHaveBeenCalled();

    expect(result).toEqual("SUCCESS");
  });

  it("Given a subscribed service input, When no service has been unsubscribed during the current day, Then the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      serviceId: aServiceId,
      subscriptionKind: "SERVICE",
      updatedAt: today.getTime(),
      version: 1
    };

    deleteEntityMock.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { statusCode: 404 })
    );
    insertEntityMock.mockRejectedValueOnce(
      Object.assign(new Error("Already exists"), { statusCode: 409 })
    );

    const result = await updateSubscriptionFeed(
      input,
      contextMock as unknown as InvocationContext,
      tableClientMock
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      "S-" + today.toISOString().substring(0, 10) + "-aServiceId-U",
      expect.any(String)
    );

    expect(insertEntityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey:
          "S-" + today.toISOString().substring(0, 10) + "-aServiceId-S",
        rowKey: expect.any(String),
        version: { type: "Int32", value: 1 }
      })
    );
    expect(result).toEqual("SUCCESS");
  });
});

describe("UpdateSubscriptionsFeedActivity - Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Given a subscribed profile input, When profile has already been unsubscribed today, Then the unsubscribe feed must be deleted and the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      previousPreferences: [],
      subscriptionKind: "PROFILE",
      updatedAt: today.getTime(),
      version: 1
    };

    const result = await updateSubscriptionFeed(
      input,
      contextMock as unknown as InvocationContext,
      tableClientMock
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      "P-" + today.toISOString().substring(0, 10) + "-U",
      expect.any(String)
    );

    expect(insertEntityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "P-" + today.toISOString().substring(0, 10) + "-S",
        rowKey: expect.any(String),
        version: { type: "Int32", value: 1 }
      })
    );

    expect(result).toEqual("SUCCESS");
  });

  it("Given a subscribed profile input, When no profile has been unsubscribed during the current day, Then the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      previousPreferences: [],
      subscriptionKind: "PROFILE",
      updatedAt: today.getTime(),
      version: 1
    };
    deleteEntityMock.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { statusCode: 404 })
    );

    const result = await updateSubscriptionFeed(
      input,
      contextMock as unknown as InvocationContext,
      tableClientMock
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      "P-" + today.toISOString().substring(0, 10) + "-U",
      expect.any(String)
    );

    expect(insertEntityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "P-" + today.toISOString().substring(0, 10) + "-S",
        version: { type: "Int32", value: 1 }
      })
    );

    expect(result).toEqual("SUCCESS");
  });
});

describe("UpdateSubscriptionsFeedActivity - Profile with preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("Given a subscribed profile with previous preferences, When profile has already been unsubscribed today, Then all service preferences subscribed feed for today must be deleted", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      previousPreferences: [aRetrievedServicePreferences],
      subscriptionKind: "PROFILE",
      updatedAt: today.getTime(),
      version: 1
    };

    const result = await updateSubscriptionFeed(
      input,
      contextMock as unknown as InvocationContext,
      tableClientMock
    );

    expect(deleteEntityMock).toHaveBeenCalledTimes(3);
    expect(deleteEntityMock).toHaveBeenCalledWith(
      "P-" + today.toISOString().substring(0, 10) + "-U",
      expect.any(String)
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      `S-${today.toISOString().substring(0, 10)}-${
        aRetrievedServicePreferences.serviceId
      }-U`,
      expect.any(String)
    );

    expect(deleteEntityMock).toHaveBeenCalledWith(
      `S-${today.toISOString().substring(0, 10)}-${
        aRetrievedServicePreferences.serviceId
      }-S`,
      expect.any(String)
    );

    expect(insertEntityMock).toHaveBeenCalledTimes(1);
    expect(insertEntityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKey: "P-" + today.toISOString().substring(0, 10) + "-S",
        version: { type: "Int32", value: 1 }
      })
    );

    expect(result).toEqual("SUCCESS");
  });
});
