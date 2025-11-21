import * as TE from "fp-ts/lib/TaskEither";
import { HealthProblem } from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { InfoHandler } from "../handler";

afterEach(() => {
  jest.clearAllMocks();
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
