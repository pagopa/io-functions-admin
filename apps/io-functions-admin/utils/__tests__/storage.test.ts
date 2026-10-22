import { TableClient } from "@azure/data-tables";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { describe, expect, it, vi } from "vitest";

import {
  createTableIfNotExists,
  deleteTableEntity,
  insertTableEntity
} from "../storage";

const aTableError = (statusCode: number) =>
  Object.assign(new Error("Table request failed"), { statusCode });

describe("Table storage helpers", () => {
  it("ignores only an already-existing table response", async () => {
    const createTable = vi.fn().mockRejectedValue(aTableError(409));
    const tableClient = { createTable } as unknown as TableClient;

    await expect(createTableIfNotExists(tableClient)).resolves.toBeUndefined();
    expect(createTable).toHaveBeenCalledOnce();
  });

  it("propagates forbidden errors while creating a table", async () => {
    const error = aTableError(403);
    const tableClient = {
      createTable: vi.fn().mockRejectedValue(error)
    } as unknown as TableClient;

    await expect(createTableIfNotExists(tableClient)).rejects.toBe(error);
  });

  it("preserves duplicate create status codes", async () => {
    const error = aTableError(409);
    const tableClient = {
      createEntity: vi.fn().mockRejectedValue(error)
    } as unknown as TableClient;

    const result = await insertTableEntity(tableClient)({
      partitionKey: "partition",
      rowKey: "row"
    });

    expect(E.isLeft(result.e1)).toBe(true);
    expect(result.e2.statusCode).toBe(409);
  });

  it("preserves missing-entity status codes for delete operations", async () => {
    const error = aTableError(404);
    const tableClient = {
      deleteEntity: vi.fn().mockRejectedValue(error)
    } as unknown as TableClient;

    const result = await deleteTableEntity(tableClient)({
      partitionKey: "partition",
      rowKey: "row"
    });

    expect(O.isSome(result.e1)).toBe(true);
    expect(result.e2.statusCode).toBe(404);
  });
});
