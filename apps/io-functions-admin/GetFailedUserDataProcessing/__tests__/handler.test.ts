/* eslint-disable @typescript-eslint/no-explicit-any */
import { TableClient } from "@azure/data-tables";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/v2/UserDataProcessingChoice";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GetFailedUserDataProcessingHandler } from "../handler";

type FailedRequest = Readonly<{
  PartitionKey: UserDataProcessingChoice;
  RowKey: FiscalCode;
}>;

const fiscalCode1 = "UEEFON48A55Y758X" as FiscalCode;
const fiscalCode2 = "VEEGON48A55Y758Z" as FiscalCode;

const failedRequests: readonly FailedRequest[] = [
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

const createTableClientMock = (entries: readonly FailedRequest[]) =>
  ({
    getEntity: vi.fn(
      (choice: UserDataProcessingChoice, fiscalCode: FiscalCode) => {
        const entry = entries.find(
          item => item.PartitionKey === choice && item.RowKey === fiscalCode
        );
        return entry
          ? Promise.resolve({ rowKey: entry.RowKey })
          : Promise.reject(
              Object.assign(new Error("Not found"), { statusCode: 404 })
            );
      }
    )
  }) as unknown as TableClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GetFailedUserDataProcessingHandler", () => {
  it("should return a not found error response if no failed request is present", async () => {
    const handler = GetFailedUserDataProcessingHandler(
      createTableClientMock([])
    );

    const result = await handler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should return an internal error response when Table Storage returns 403", async () => {
    const tableClient = {
      getEntity: vi.fn(() =>
        Promise.reject(
          Object.assign(new Error("Forbidden"), { statusCode: 403 })
        )
      )
    } as unknown as TableClient;
    const handler = GetFailedUserDataProcessingHandler(tableClient);

    const result = await handler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should return the fiscal code when a failed request is present", async () => {
    const handler = GetFailedUserDataProcessingHandler(
      createTableClientMock(failedRequests)
    );

    const result = await handler(
      {} as any,
      UserDataProcessingChoiceEnum.DELETE,
      fiscalCode1
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        failedDataProcessingUser: fiscalCode1
      });
    }
  });
});
