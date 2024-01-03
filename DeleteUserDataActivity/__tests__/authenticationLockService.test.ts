import { RestError } from "@azure/data-tables";

import * as E from "fp-ts/Either";
import * as ROA from "fp-ts/ReadonlyArray";

import AuthenticationLockService from "../authenticationLockService";

import {
  aFiscalCode,
  aNotReleasedData,
  anUnlockCode,
  anothernUnlockCode,
  brokeEntityProfileLockedRecordIterator,
  errorProfileLockedRecordIterator,
  getProfileLockedRecordIterator,
  listLockedProfileEntitiesMock,
  lockedProfileTableClient,
  submitTransactionMock
} from "../../__mocks__/lockedProfileTableClient";
import { UnlockCode } from "../../generated/definitions/UnlockCode";

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
    ${"more records"} | ${[aNotReleasedData, { ...aNotReleasedData, rowKey: anothernUnlockCode, Released: true }]}
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

    expect(result).toEqual(
      E.left(
        Error(
          'value ["CF"] at [root.0.0.0.partitionKey] is not a valid [string that matches the pattern "^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$"] / value [undefined] at [root.0.0.1.Released] is not a valid [boolean] / value ["CF"] at [root.0.1.partitionKey] is not a valid [string that matches the pattern "^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$"]'
        )
      )
    );
  });
});

describe("AuthenticationLockService#deleteUserAuthenticationLockData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const generateUnlockCodes = (number: number) =>
    [...Array(number).keys()].map(i => i.toString().padStart(9, "0"));
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
