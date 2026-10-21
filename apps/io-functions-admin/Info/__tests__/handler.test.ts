import { HealthProblem } from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { isLeft } from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/cosmosdb", () => ({
  cosmosdbClient: {
    database: vi.fn()
  }
}));

import { checkCosmosDbHealth, InfoHandler } from "../handler";

afterEach(() => {
  vi.clearAllMocks();
});

describe("InfoHandler", () => {
  it("should return an internal error if the application is not healthy", async () => {
    const healthCheck = (_: unknown) =>
      TE.left([
        "failure 1" as HealthProblem<"Config">,
        "failure 2" as HealthProblem<"Config">
      ]);
    const handler = InfoHandler(healthCheck);

    const response = await handler();

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a success if the application is healthy", async () => {
    const healthCheck = (_: unknown) => TE.of(true as const);
    const handler = InfoHandler(healthCheck);

    const response = await handler();

    expect(response.kind).toBe("IResponseSuccessJson");
  });
});

describe("checkCosmosDbHealth", () => {
  it("returns healthy when the shared database is readable", async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const getDatabase = vi.fn(() => ({ read }));

    const result = await checkCosmosDbHealth(getDatabase)();

    expect(result).toEqual({ _tag: "Right", right: true });
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("returns a 403 failure without retrying or falling back", async () => {
    const read = vi.fn().mockRejectedValue(new Error("403 Forbidden"));
    const getDatabase = vi.fn(() => ({ read }));

    const result = await checkCosmosDbHealth(getDatabase)();

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.left.join("\n")).toContain("403 Forbidden");
    }
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
