const mockJsonBody = { foo: "bar" };
const mockTextBody = "foobar";

export const mockResponseJson = jest
  .fn()
  .mockImplementation(async () => mockJsonBody);

export const mockResponseText = jest
  .fn()
  .mockImplementation(async () => mockTextBody);

interface IMockResponseValues {
  jsonImpl?: () => Promise<object>;
  status?: number;
  textImpl?: () => Promise<string>;
}

const getMockResponse = ({
  jsonImpl = async () => mockJsonBody,
  status = 100,
  textImpl = async () => mockTextBody
}: IMockResponseValues = {}): Response =>
  (({
    clone: jest.fn(() => getMockResponse({ jsonImpl, status, textImpl })),
    json: jest.fn(jsonImpl),
    status,
    text: jest.fn(textImpl)
  } as unknown) as Response);

export const mockResponse: Response = getMockResponse();

// use this method to create an instance of fetch which is bound to predefined values
export const createMockFetch = ({
  jsonImpl = async () => mockJsonBody,
  status = 100,
  textImpl = async () => mockTextBody
}: IMockResponseValues = {}): typeof fetch =>
  jest
    .fn()
    .mockImplementation(async (_: RequestInfo, __?: RequestInit) =>
      getMockResponse({ jsonImpl, status, textImpl })
    );

const mockFetch = jest
  .fn()
  .mockImplementation(async (_: RequestInfo, __?: RequestInit) => mockResponse);

export default mockFetch;
