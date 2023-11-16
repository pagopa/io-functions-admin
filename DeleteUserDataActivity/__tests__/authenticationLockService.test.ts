import { RestError } from "@azure/data-tables";

import * as E from "fp-ts/Either";

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

describe("AuthenticationLockService#unlockUserAuthentication", () => {
  it("should return true when records update transaction succeded", async () => {
    const result = await service.deleteUserAuthenticationLockData(aFiscalCode, [
      anUnlockCode,
      anothernUnlockCode
    ])();

    expect(result).toEqual(E.right(true));
    expect(submitTransactionMock).toHaveBeenCalledWith([
      [
        "delete",
        {
          partitionKey: aFiscalCode,
          rowKey: anUnlockCode
        }
      ],
      [
        "delete",
        {
          partitionKey: aFiscalCode,
          rowKey: anothernUnlockCode
        }
      ]
    ]);
  });

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
