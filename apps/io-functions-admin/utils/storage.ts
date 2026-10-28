import type { TokenCredential } from "@azure/core-auth";

import { TableClient, TableEntity } from "@azure/data-tables";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import { ITuple2, Tuple2 } from "@pagopa/ts-commons/lib/tuples";
import { Either, left, right, toError } from "fp-ts/lib/Either";
import { none, Option, some } from "fp-ts/lib/Option";

export const createTableStorageCredential = (
  isProduction: boolean
): TokenCredential =>
  isProduction ? new ManagedIdentityCredential() : new AzureCliCredential();

export const createTableClient = (
  endpoint: string,
  tableName: string,
  credential: TokenCredential
): TableClient => new TableClient(endpoint, tableName, credential);

export const getTableStorageStatusCode = (
  error: unknown
): number | undefined =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;

export const createTableIfNotExists = async (
  tableClient: TableClient
): Promise<void> => {
  try {
    await tableClient.createTable();
  } catch (error) {
    if (getTableStorageStatusCode(error) !== 409) {
      throw toError(error);
    }
  }
};

type TableStorageResponse = Readonly<{
  statusCode: number;
}>;

/**
 * A promisified version of TableService.insertEntity
 */
export const insertTableEntity =
  (tableClient: TableClient) =>
  <T extends object>(
    entity: TableEntity<T>
  ): Promise<ITuple2<Either<Error, TableEntity<T>>, TableStorageResponse>> =>
    tableClient.createEntity(entity).then(
      () => Tuple2(right(entity), { statusCode: 204 }),
      error =>
        Tuple2(left(toError(error)), {
          statusCode: getTableStorageStatusCode(error) ?? 500
        })
    );

export type InsertTableEntity = ReturnType<typeof insertTableEntity>;

/**
 * A promisified version of TableService.deleteEntity
 */
export const deleteTableEntity =
  (tableClient: TableClient) =>
  <T extends Pick<TableEntity, "partitionKey" | "rowKey">>(
    entity: T
  ): Promise<ITuple2<Option<Error>, TableStorageResponse>> =>
    tableClient.deleteEntity(entity.partitionKey, entity.rowKey).then(
      () => Tuple2(none, { statusCode: 204 }),
      error =>
        Tuple2(some(toError(error)), {
          statusCode: getTableStorageStatusCode(error) ?? 500
        })
    );

export type DeleteTableEntity = ReturnType<typeof deleteTableEntity>;
