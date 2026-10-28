/* eslint-disable @typescript-eslint/no-explicit-any */
import { TableClient } from "@azure/data-tables";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/v2/UserDataProcessingChoice";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ActivityResultFailure,
  ActivityResultSuccess,
  IsFailedUserDataProcessing
} from "../handler";

const findEntry =
  (
    entries: readonly {
      PartitionKey: UserDataProcessingChoice;
      RowKey: FiscalCode;
    }[]
  ) =>
  (choice: UserDataProcessingChoice, fiscalCode: FiscalCode) =>
    entries.length > 0
      ? entries
          .filter(e => e.PartitionKey === choice && e.RowKey === fiscalCode)
          .map(e => ({
            RowKey: { _: e.RowKey }
          }))[0]
      : null;

const retrieveEntityFailedUserDataProcessingMock = (
  entries: readonly {
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }[]
) =>
  vi.fn((choice: UserDataProcessingChoice, fiscalCode: FiscalCode) => {
    const entry = findEntry(entries)(choice, fiscalCode);
    return entry
      ? Promise.resolve({ rowKey: entry.RowKey._ })
      : Promise.reject(
          Object.assign(new Error("Not found"), { statusCode: 404 })
        );
  });

const internalErrorRetrieveEntityFailedUserDataProcessingMock = (
  _entries: readonly {
    PartitionKey: UserDataProcessingChoice;
    RowKey: FiscalCode;
  }[]
) =>
  vi.fn(() =>
    Promise.reject(Object.assign(new Error("Forbidden"), { statusCode: 403 }))
  );

const fiscalCode1 = "UEEFON48A55Y758X" as FiscalCode;
const fiscalCode2 = "VEEGON48A55Y758Z" as FiscalCode;

const noFailedRequests: typeof failedRequests = [];

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
  vi.clearAllMocks();
});

describe("IsFailedUserDataProcessingHandler", () => {
  it("should fail if input is not valid", async () => {
    const tableClientMock = {
      getEntity: retrieveEntityFailedUserDataProcessingMock(noFailedRequests)
    } as unknown as TableClient;

    const getFailedUserDataProcessingHandler =
      IsFailedUserDataProcessing(tableClientMock);

    const result = await getFailedUserDataProcessingHandler(
      {
        a: "a",
        b: "b",
        c: "c"
      },
      {} as any
    );

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

  it("should fail when Table Storage returns 403", async () => {
    const tableClientMock = {
      getEntity:
        internalErrorRetrieveEntityFailedUserDataProcessingMock(failedRequests)
    } as unknown as TableClient;

    const getFailedUserDataProcessingHandler =
      IsFailedUserDataProcessing(tableClientMock);

    const result = await getFailedUserDataProcessingHandler(
      {
        choice: UserDataProcessingChoiceEnum.DELETE,
        fiscalCode: fiscalCode1
      },
      {} as any
    );

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
    const tableClientMock = {
      getEntity: retrieveEntityFailedUserDataProcessingMock(noFailedRequests)
    } as unknown as TableClient;

    const getFailedUserDataProcessingHandler =
      IsFailedUserDataProcessing(tableClientMock);

    const result = await getFailedUserDataProcessingHandler(
      {
        choice: UserDataProcessingChoiceEnum.DELETE,
        fiscalCode: fiscalCode1
      },
      {} as any
    );

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
    const tableClientMock = {
      getEntity: retrieveEntityFailedUserDataProcessingMock(failedRequests)
    } as unknown as TableClient;

    const getFailedUserDataProcessingHandler =
      IsFailedUserDataProcessing(tableClientMock);

    const result = await getFailedUserDataProcessingHandler(
      {
        choice: UserDataProcessingChoiceEnum.DELETE,
        fiscalCode: fiscalCode1
      },
      {} as any
    );

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
