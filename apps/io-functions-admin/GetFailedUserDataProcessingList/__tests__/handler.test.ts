/* eslint-disable @typescript-eslint/no-explicit-any */
import { TableClient } from "@azure/data-tables";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/v2/UserDataProcessingChoice";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GetFailedUserDataProcessingListHandler } from "../handler";

const queryEntitiesFailedUserDataProcessingMock = (
  entries: readonly {
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }[],
  pageSize = entries.length || 1
): TableClient =>
  ({
    listEntities: vi.fn((options: { queryOptions?: { filter?: string } }) => {
      const filter = options.queryOptions?.filter ?? "";
      const matchingEntries = entries.filter(entry =>
        filter.includes(entry.PartitionKey)
      );

      return {
        byPage: vi.fn(() =>
          (async function* () {
            for (
              let index = 0;
              index < matchingEntries.length;
              index += pageSize
            ) {
              yield matchingEntries
                .slice(index, index + pageSize)
                .map(entry => ({
                  partitionKey: entry.PartitionKey,
                  rowKey: entry.RowKey
                }));
            }
          })()
        )
      };
    })
  }) as unknown as TableClient;

const fiscalCode = "UEEFON48A55Y758X" as FiscalCode;
const anotherFiscalCode = "VEEGON48A55Y758Z" as FiscalCode;

const noFailedRequests: typeof oneFailedDeleteRequest = [];

const oneFailedDeleteRequest = [
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: fiscalCode
  }
];

const oneFailedDownloadRequest = [
  {
    PartitionKey: UserDataProcessingChoiceEnum.DOWNLOAD,
    RowKey: fiscalCode
  }
];

const twoFailedDifferentRequests = [
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: fiscalCode
  },
  {
    PartitionKey: UserDataProcessingChoiceEnum.DOWNLOAD,
    RowKey: fiscalCode
  }
];

const twoFailedDeleteRequests = [
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: fiscalCode
  },
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: anotherFiscalCode
  }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GetFailedUserDataProcessingListHandler", () => {
  it("should return an empty json if no failed user data processing request is present", async () => {
    const tableServiceMock =
      queryEntitiesFailedUserDataProcessingMock(noFailedRequests);

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: []
      });
    }
  });

  it("should return a json with a fiscalcode if failed user data delete request has been found", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      oneFailedDeleteRequest
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: [fiscalCode]
      });
    }
  });

  it("should return an empty json with a fiscalcode because no failed user data delete request has been found", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      oneFailedDownloadRequest
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: []
      });
    }
  });

  it("should return a json with a fiscalcode if failed user data download request has been found", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      oneFailedDownloadRequest
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DOWNLOAD as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: [fiscalCode]
      });
    }
  });

  it("should return an empty json with a fiscalcode because no failed user data download request has been found", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      oneFailedDeleteRequest
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DOWNLOAD as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: []
      });
    }
  });

  it("should return a json with only a fiscalcode because there is only one failed user data delete request", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      twoFailedDifferentRequests
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: [fiscalCode]
      });

      expect(result.value.failedDataProcessingUsers.length).toEqual(1);
    }
  });

  it("should return a json with only a fiscalcode because there is only one failed user data download request", async () => {
    const tableServiceMock = queryEntitiesFailedUserDataProcessingMock(
      twoFailedDifferentRequests
    );

    const getFailedUserDataProcessingListHandler =
      GetFailedUserDataProcessingListHandler(tableServiceMock);

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
      UserDataProcessingChoiceEnum.DOWNLOAD as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUsers: [fiscalCode]
      });

      expect(result.value.failedDataProcessingUsers.length).toEqual(1);
    }
  });

  it("should follow continuation pages and return every matching fiscal code", async () => {
    const tableClientMock = queryEntitiesFailedUserDataProcessingMock(
      twoFailedDeleteRequests,
      1
    );
    const handler = GetFailedUserDataProcessingListHandler(tableClientMock);

    const result = await handler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE as NonEmptyString
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value.failedDataProcessingUsers).toEqual([
        fiscalCode,
        anotherFiscalCode
      ]);
    }
  });
});
