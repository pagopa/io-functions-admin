/* tslint:disable: no-any */

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import { UserDataProcessingChoice, UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { GetFailedUserDataProcessingListHandler } from "../handler";

const queryEntitiesFailedUserDataProcessingMock = (
  entries: ReadonlyArray<{
    PartitionKey: UserDataProcessingChoice,
    RowKey: FiscalCode
  }>
) =>
  jest.fn((_, tableQuery, ___, cb) => {
    return cb(
      null,
      {
        entries:
          entries.length > 0
            ? entries
              .filter(e => tableQuery._where[0] == "PartitionKey eq '" + e.PartitionKey + "'")
              .map(e => ({
                RowKey: { _: e.RowKey }
              }))
            : []
      },
      { isSuccessful: true }
    );
  });

const storageTableMock = "FailedUserDataProcessing" as NonEmptyString;

const fiscalCode = "UEEFON48A55Y758X" as FiscalCode;

const noFailedRequests = [];

const oneFailedDeleteRequest = [{
  PartitionKey: UserDataProcessingChoiceEnum.DELETE,
  RowKey: fiscalCode
}];

const oneFailedDownloadRequest = [{
  PartitionKey: UserDataProcessingChoiceEnum.DOWNLOAD,
  RowKey: fiscalCode
}];

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GetFailedUserDataProcessingListHandler", () => {

  it("should return an empty json if no failed user data processing request is present", async () => {
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(noFailedRequests)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(oneFailedDeleteRequest)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(oneFailedDownloadRequest)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(oneFailedDownloadRequest)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(oneFailedDeleteRequest)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(twoFailedDifferentRequests)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
    const tableServiceMock = ({
      queryEntities: queryEntitiesFailedUserDataProcessingMock(twoFailedDifferentRequests)
    } as any) as TableService;

    const getFailedUserDataProcessingListHandler = GetFailedUserDataProcessingListHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingListHandler(
      {} as any,
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
});
