/* tslint:disable: no-any */

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { GetFailedUserDataProcessingHandler } from "../handler";

const findEntry = (
  entries: ReadonlyArray<{
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }>
) => (choice, fiscalCode) =>
  entries.length > 0
    ? entries
        .filter(e => e.PartitionKey === choice && e.RowKey === fiscalCode)
        .map(e => ({
          RowKey: { _: e.RowKey }
        }))[0]
    : null;

const retrieveEntityFailedUserDataProcessingMock = (
  entries: ReadonlyArray<{
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }>
) =>
  jest.fn((_, choice, fiscalCode, ____, cb) => {
    return cb(
      findEntry(entries)(choice, fiscalCode)
        ? null
        : new Error("Internal error"),
      findEntry(entries)(choice, fiscalCode),
      {
        isSuccessful: findEntry(entries)(choice, fiscalCode)
      }
    );
  });

const internalErrorRetrieveEntityFailedUserDataProcessingMock = (
  entries: ReadonlyArray<{
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }>
) =>
  jest.fn((_, choice, fiscalCode, ____, cb) => {
    return cb(new Error("Internal error"), null, { isSuccessful: false });
  });

const storageTableMock = "FailedUserDataProcessing" as NonEmptyString;

const fiscalCode1 = "UEEFON48A55Y758X" as FiscalCode;
const fiscalCode2 = "VEEGON48A55Y758Z" as FiscalCode;

const noFailedRequests = [];

const failedRequests = [
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: fiscalCode1
  },
  {
    PartitionKey: UserDataProcessingChoiceEnum.DOWNLOAD,
    RowKey: fiscalCode1
  },
  {
    PartitionKey: UserDataProcessingChoiceEnum.DELETE,
    RowKey: fiscalCode2
  },
  {
    PartitionKey: UserDataProcessingChoiceEnum.DOWNLOAD,
    RowKey: fiscalCode2
  }
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GetFailedUserDataProcessingHandler", () => {
  it("should return an internal error response if no failed user data processing request is present", async () => {
    const tableServiceMock = ({
      retrieveEntity: retrieveEntityFailedUserDataProcessingMock(
        noFailedRequests
      )
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = GetFailedUserDataProcessingHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler(
      {} as any,
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should return an internal error response if retrieve entity fails", async () => {
    const tableServiceMock = ({
      retrieveEntity: internalErrorRetrieveEntityFailedUserDataProcessingMock(
        noFailedRequests
      )
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = GetFailedUserDataProcessingHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler(
      {} as any,
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should return a fiscalcode if a failed request is present", async () => {
    const tableServiceMock = ({
      retrieveEntity: retrieveEntityFailedUserDataProcessingMock(failedRequests)
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = GetFailedUserDataProcessingHandler(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler(
      {} as any,
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUser: fiscalCode1
      });

      expect(result.value).not.toEqual({
        failedDataProcessingUser: fiscalCode2
      });
    }
  });
});
