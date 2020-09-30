import { taskEither, fromLeft } from "fp-ts/lib/TaskEither";
import { HealthCheck } from "../../utils/healthcheck";
import { InfoHandler } from "../handler";

const mockHealthCheck = jest.fn<HealthCheck, []>(() => taskEither.of(true));

afterEach(() => {
  jest.clearAllMocks();
});

describe("InfoHandler", () => {
  it("should return an internal error if the application is not healthy", async () => {
    mockHealthCheck.mockImplementationOnce(() =>
      fromLeft(["failure 1", "failure 2"])
    );

    const handler = InfoHandler(mockHealthCheck);

    const response = await handler();

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a success if the application is healthy", async () => {
    const handler = InfoHandler(mockHealthCheck);
    
    const response = await handler();

    expect(response.kind).toBe("IResponseSuccessJson");
  });
});
