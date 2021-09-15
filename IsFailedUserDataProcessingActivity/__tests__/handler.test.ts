import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import {
  ActivityResultFailure,
  ActivityResultSuccess,
  IsFailedUserDataProcessing
} from "../handler";
import * as E from "fp-ts/lib/Either";

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
        isSuccessful: findEntry(entries)(choice, fiscalCode),
        statusCode: findEntry(entries)(choice, fiscalCode) ? 200 : 404
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

describe("IsFailedUserDataProcessingHandler", () => {
  it("should fail if input is not valid", async () => {
    const tableServiceMock = ({
      retrieveEntity: retrieveEntityFailedUserDataProcessingMock(
        noFailedRequests
      )
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = IsFailedUserDataProcessing(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler({} as any, {
      a: "a",
      b: "b",
      c: "c"
    });

    expect(ActivityResultFailure.is(result)).toBe(true);
    const decodedResult = ActivityResultFailure.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(JSON.stringify(decodedResult.right)).toBe(
        JSON.stringify({
          kind: "FAILURE",
          reason: "Invalid input"
        })
      );
    }
  });

  it("should fail if any error occurs", async () => {
    const tableServiceMock = ({
      retrieveEntity: internalErrorRetrieveEntityFailedUserDataProcessingMock(
        failedRequests
      )
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = IsFailedUserDataProcessing(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler({} as any, {
      choice: UserDataProcessingChoiceEnum.DELETE,
      fiscalCode: fiscalCode1
    });

    expect(ActivityResultFailure.is(result)).toBe(true);
    const decodedResult = ActivityResultFailure.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(JSON.stringify(decodedResult.right)).toBe(
        JSON.stringify({
          kind: "FAILURE",
          reason: "ERROR|tableService.retrieveEntity|Cannot retrieve entity"
        })
      );
    }
  });

  it("should succeed with false value if no failed user data processing is present", async () => {
    const tableServiceMock = ({
      retrieveEntity: retrieveEntityFailedUserDataProcessingMock(
        noFailedRequests
      )
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = IsFailedUserDataProcessing(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler({} as any, {
      choice: UserDataProcessingChoiceEnum.DELETE,
      fiscalCode: fiscalCode1
    });

    expect(ActivityResultSuccess.is(result)).toBe(true);
    const decodedResult = ActivityResultSuccess.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(JSON.stringify(decodedResult.right)).toBe(
        JSON.stringify({ kind: "SUCCESS", value: false })
      );
    }
  });

  it("should succeed with true value if failed user data processing is present", async () => {
    const tableServiceMock = ({
      retrieveEntity: retrieveEntityFailedUserDataProcessingMock(failedRequests)
    } as any) as TableService;

    const getFailedUserDataProcessingHandler = IsFailedUserDataProcessing(
      tableServiceMock,
      storageTableMock
    );

    const result = await getFailedUserDataProcessingHandler({} as any, {
      choice: UserDataProcessingChoiceEnum.DELETE,
      fiscalCode: fiscalCode1
    });

    expect(ActivityResultSuccess.is(result)).toBe(true);
    const decodedResult = ActivityResultSuccess.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(JSON.stringify(decodedResult.right)).toBe(
        JSON.stringify({ kind: "SUCCESS", value: true })
      );
    }
  });
});
