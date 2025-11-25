import { RestError } from "@azure/data-tables";
import * as E from "fp-ts/lib/Either";
import * as NEA from "fp-ts/NonEmptyArray";
import * as ROA from "fp-ts/ReadonlyArray";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aFiscalCode,
  anothernUnlockCode,
  aNotReleasedData,
  anUnlockCode,
  brokeEntityProfileLockedRecordIterator,
  errorProfileLockedRecordIterator,
  getProfileLockedRecordIterator,
  listLockedProfileEntitiesMock,
  lockedProfileTableClient,
  submitTransactionMock
} from "../../__mocks__/lockedProfileTableClient";
import { UnlockCode } from "../../generated/definitions/UnlockCode";
import AuthenticationLockService from "../authenticationLockService";

// -------------------------------------------
// Variables
// -------------------------------------------

const service = new AuthenticationLockService(lockedProfileTableClient);

describe("AuthenticationLockService#getAllUserAuthenticationLockData", () => {
  it("should return an empty array if query returns no records from table storage", async () => {
    const result = await service.getAllUserAuthenticationLockData(
      aFiscalCode
    )();

    expect(result).toEqual(E.right([]));
    expect(listLockedProfileEntitiesMock).toHaveBeenCalledWith({
      queryOptions: {
        filter: `PartitionKey eq '${aFiscalCode}'`
      }
    });
  });

  it.each`
    title             | records
    ${"one record"}   | ${[aNotReleasedData]}
    ${"more records"} | ${[aNotReleasedData, { ...aNotReleasedData, Released: true, rowKey: anothernUnlockCode }]}
  `(
    "should return all the records, if $title are found in table storage",
    async ({ records }) => {
      listLockedProfileEntitiesMock.mockImplementationOnce(() =>
        getProfileLockedRecordIterator(records)
      );

      const result = await service.getAllUserAuthenticationLockData(
        aFiscalCode
      )();

      expect(result).toEqual(E.right(records));
    }
  );

  it("should return an error if something went wrong retrieving the records", async () => {
    listLockedProfileEntitiesMock.mockImplementationOnce(
      errorProfileLockedRecordIterator
    );

    const result = await service.getAllUserAuthenticationLockData(
      aFiscalCode
    )();

    expect(result).toEqual(E.left(Error("an Error")));
  });

  it("should return an error if something went wrong decoding a record", async () => {
    listLockedProfileEntitiesMock.mockImplementationOnce(
      brokeEntityProfileLockedRecordIterator
    );

    const result = await service.getAllUserAuthenticationLockData(
      aFiscalCode
    )();

    expect(result).toMatchObject(
      E.left({
        message: expect.stringContaining(
          "is not a valid [string that matches the pattern"
        )
      })
    );
  });
});

describe("AuthenticationLockService#deleteUserAuthenticationLockData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateUnlockCodes = (number: number) =>
    NEA.range(0, number).map(i => i.toString().padStart(9, "0"));
  it.each`
    scenario                      | items
    ${"with less than 100 items"} | ${generateUnlockCodes(50)}
    ${"with more than 100 items"} | ${generateUnlockCodes(150)}
  `(
    "should return true when records delete transaction succeded $scenario",
    async ({ items }: { items: UnlockCode[] }) => {
      const result = await service.deleteUserAuthenticationLockData(
        aFiscalCode,
        items
      )();

      expect(result).toEqual(E.right(true));

      let i = 1;
      for (const chunk of ROA.chunksOf(100)(items)) {
        expect(submitTransactionMock).toHaveBeenNthCalledWith(
          i,
          chunk.map(unlockCode => [
            "delete",
            {
              partitionKey: aFiscalCode,
              rowKey: unlockCode
            }
          ])
        );

        i++;
      }
    }
  );

  it("should return an Error when at least one CF-unlock code was not found", async () => {
    submitTransactionMock.mockRejectedValueOnce(
      new RestError("Not Found", { statusCode: 404 })
    );
    const result = await service.deleteUserAuthenticationLockData(aFiscalCode, [
      anUnlockCode,
      anothernUnlockCode
    ])();

    expect(result).toEqual(
      E.left(new Error("Something went wrong deleting the records"))
    );
  });

  it("should return an Error when an error occurred deleting the records", async () => {
    submitTransactionMock.mockRejectedValueOnce(
      new RestError("An Error", { statusCode: 500 })
    );
    const result = await service.deleteUserAuthenticationLockData(aFiscalCode, [
      anUnlockCode
    ])();

    expect(result).toEqual(
      E.left(new Error("Something went wrong deleting the records"))
    );
  });
});
