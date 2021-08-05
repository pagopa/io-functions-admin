import { Context } from "@azure/functions";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServicePreference } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mocks";
import { aRetrievedServicePreference } from "../../__mocks__/mocks.service_preference";

import { Input, updateSubscriptionFeed } from "../handler";

const aServiceId = "aServiceId" as ServiceId;

const insertEntityMock = jest.fn((_, __, f) => {
  f(undefined, undefined, { isSuccessful: true });
});

const deleteEntityMock = jest.fn((_, __, f) => {
  f(undefined, { isSuccessful: true });
});

const tableServiceMock = ({
  deleteEntity: deleteEntityMock,
  insertEntity: insertEntityMock
} as unknown) as TableService;

const today = new Date();

describe("UpdateSubscriptionsFeedActivity - Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Given a subscribed service input, When service has already been unsubscribed today, Then the unsubscribe feed must be deleted", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      serviceId: aServiceId,
      updatedAt: today.getTime(),
      version: 1,
      subscriptionKind: "SERVICE"
    };

    const result = await updateSubscriptionFeed(
      (contextMock as unknown) as Context,
      input,
      tableServiceMock,
      "aTable" as NonEmptyString
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "S-" + today.toISOString().substring(0, 10) + "-aServiceId-U"
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.insertEntity).not.toHaveBeenCalled();

    expect(result).toEqual("SUCCESS");
  });

  it("Given a subscribed service input, When no service has been unsubscribed during the current day, Then the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      serviceId: aServiceId,
      updatedAt: today.getTime(),
      version: 1,
      subscriptionKind: "SERVICE"
    };

    deleteEntityMock.mockImplementationOnce((_, __, f) => {
      f(Error("an Error"), { isSuccessful: false, statusCode: 404 });
    });

    const result = await updateSubscriptionFeed(
      (contextMock as unknown) as Context,
      input,
      tableServiceMock,
      "aTable" as NonEmptyString
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "S-" + today.toISOString().substring(0, 10) + "-aServiceId-U"
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.insertEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "S-" + today.toISOString().substring(0, 10) + "-aServiceId-S"
        })
      }),
      expect.any(Function)
    );
    expect(result).toEqual("SUCCESS");
  });
});

describe("UpdateSubscriptionsFeedActivity - Profile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Given a subscribed profile input, When profile has already been unsubscribed today, Then the unsubscribe feed must be deleted and the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      updatedAt: today.getTime(),
      version: 1,
      subscriptionKind: "PROFILE",
      previousPreferences: []
    };

    const result = await updateSubscriptionFeed(
      (contextMock as unknown) as Context,
      input,
      tableServiceMock,
      "aTable" as NonEmptyString
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-U"
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.insertEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-S"
        })
      }),
      expect.any(Function)
    );

    expect(result).toEqual("SUCCESS");
  });

  it("Given a subscribed profile input, When no profile has been unsubscribed during the current day, Then the subscribe feed must be added", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      updatedAt: today.getTime(),
      version: 1,
      subscriptionKind: "PROFILE",
      previousPreferences: []
    };
    deleteEntityMock.mockImplementationOnce((_, __, f) => {
      f(Error("an Error"), { isSuccessful: false, statusCode: 404 });
    });

    const result = await updateSubscriptionFeed(
      (contextMock as unknown) as Context,
      input,
      tableServiceMock,
      "aTable" as NonEmptyString
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-U"
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.insertEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-S"
        })
      }),
      expect.any(Function)
    );

    expect(result).toEqual("SUCCESS");
  });
});

describe("UpdateSubscriptionsFeedActivity - Profile with preferences", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("Given a subscribed profile with previous preferences, When profile has already been unsubscribed today, Then all service preferences subscribed feed for today must be deleted", async () => {
    const input: Input = {
      fiscalCode: aFiscalCode,
      operation: "SUBSCRIBED",
      previousPreferences: [aRetrievedServicePreference],
      subscriptionKind: "PROFILE",
      updatedAt: today.getTime(),
      version: 1
    };

    const result = await updateSubscriptionFeed(
      (contextMock as unknown) as Context,
      input,
      tableServiceMock,
      "aTable" as NonEmptyString
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledTimes(3);
    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-U"
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: `S-${today.toISOString().substring(0, 10)}-${
            aRetrievedServicePreference.serviceId
          }-U`
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.deleteEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: `S-${today.toISOString().substring(0, 10)}-${
            aRetrievedServicePreference.serviceId
          }-S`
        })
      }),
      expect.any(Function)
    );

    expect(tableServiceMock.insertEntity).toHaveBeenCalledTimes(1);
    expect(tableServiceMock.insertEntity).toHaveBeenCalledWith(
      "aTable",
      expect.objectContaining({
        PartitionKey: expect.objectContaining({
          _: "P-" + today.toISOString().substring(0, 10) + "-S"
        })
      }),
      expect.any(Function)
    );

    expect(result).toEqual("SUCCESS");
  });
});
