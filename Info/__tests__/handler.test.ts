import { InfoHandler } from "../handler";

const mockGetConfig = jest.fn(() => {});

afterEach(() => {
  jest.clearAllMocks();
});

describe("InfoHandler", () => {
  it("should return an internal error if the configuration is wrong", async () => {
    mockGetConfig.mockImplementationOnce(() => {
      throw new Error("failure");
    });

    // @ts-ignore
    const handler = InfoHandler({ getConfig: mockGetConfig });

    const response = await handler();

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a success if the configuration is ok", async () => {
    // @ts-ignore
    const handler = InfoHandler({ getConfig: mockGetConfig });

    const response = await handler();

    expect(response.kind).toBe("IResponseSuccessJson");
  });
});
