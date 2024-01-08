import {
  TableClient,
  TableInsertEntityHeaders,
  TableTransactionResponse
} from "@azure/data-tables";

import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UnlockCode } from "../generated/definitions/UnlockCode";

// --------------------------------
// Data
// --------------------------------

export const aFiscalCode = "GRBGPP87L04L741X" as FiscalCode;
export const anUnlockCode = "123456789" as UnlockCode;
export const anothernUnlockCode = "987654321" as UnlockCode;

export const aNotReleasedData = {
  partitionKey: aFiscalCode,
  rowKey: anUnlockCode,
  timestamp: new Date(2021, 11, 1),
  CreatedAt: new Date(2022, 1, 1)
};

// --------------------------------
// Azure TableClient Mock
// --------------------------------

export async function* profileLockedRecordIterator() {
  yield aNotReleasedData;
}
export async function* getProfileLockedRecordIterator(values: any[]) {
  for (const value of values) yield value;
}
export async function* noProfileLockedRecordIterator(): ReturnType<
  typeof profileLockedRecordIterator
> {}
export async function* errorProfileLockedRecordIterator(): ReturnType<
  typeof profileLockedRecordIterator
> {
  //Sonarcloud requires at least one `yield` before `throw` operation
  yield aNotReleasedData;
  throw new Error("an Error");
}
export async function* brokeEntityProfileLockedRecordIterator(): ReturnType<
  typeof profileLockedRecordIterator
> {
  yield {
    ...aNotReleasedData,
    partitionKey: "CF" as FiscalCode
  };
}

export const listLockedProfileEntitiesMock = jest.fn(
  noProfileLockedRecordIterator
);

export const submitTransactionMock = jest.fn(
  async () => ({ status: 202 } as TableTransactionResponse)
);

export const lockedProfileTableClient: TableClient = ({
  listEntities: listLockedProfileEntitiesMock,
  submitTransaction: submitTransactionMock
} as unknown) as TableClient;
