import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { beforeEach, describe, expect, it } from "vitest";

import { isCosmosErrors } from "../utils";

describe("utils", () => {
  // --------------
  // Just a bunch of types needed for creating a tuple from an union type
  // See https://www.hacklewayne.com/typescript-convert-union-to-tuple-array-yes-but-how
  type Contra<T> = T extends any ? (arg: T) => void : never;
  type InferContra<T> = [T] extends [(arg: infer I) => void] ? I : never;
  type PickOne<T> = InferContra<InferContra<Contra<Contra<T>>>>;
  type Union2Tuple<T> =
    PickOne<T> extends infer U // assign PickOne<T> to U
      ? Exclude<T, U> extends never // T and U are the same
        ? [T]
        : [...Union2Tuple<Exclude<T, U>>, U] // recursion
      : never;
  // --------------

  type CosmosErrorsTypesTuple = Union2Tuple<CosmosErrors["kind"]>;

  // NOTE: If a new cosmos error is added, the following initialization will not compile,
  // forcing us to update `CosmosErrorsTypes` with the new value
  const values: CosmosErrorsTypesTuple = [
    "COSMOS_EMPTY_RESPONSE",
    "COSMOS_CONFLICT_RESPONSE",
    "COSMOS_DECODING_ERROR",
    "COSMOS_ERROR_RESPONSE"
  ];

  it.each(values)(
    "isCosmosErrors should return true if error is a CosmosError of type %s",
    v => {
      expect(isCosmosErrors({ kind: v })).toBe(true);
    }
  );

  it("isCosmosErrors should return false if error is not a CosmosError", () => {
    expect(isCosmosErrors({ kind: "ANOTHER_ERROR" })).toBe(false);
  });
});
