import { vi } from "vitest";

const mockJsonBody = { foo: "bar" };
const mockTextBody = "foobar";

export const mockResponseJson = vi
  .fn()
  .mockImplementation(async () => mockJsonBody);

export const mockResponseText = vi
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
    clone: vi.fn(() => getMockResponse({ jsonImpl, status, textImpl })),
    json: vi.fn(jsonImpl),
    status,
    text: vi.fn(textImpl)
  } as unknown) as Response);

export const mockResponse: Response = getMockResponse();

// use this method to create an instance of fetch which is bound to predefined values
export const createMockFetch = ({
  jsonImpl = async () => mockJsonBody,
  status = 100,
  textImpl = async () => mockTextBody
}: IMockResponseValues = {}): typeof fetch =>
  vi
    .fn()
    .mockImplementation(async (_: RequestInfo, __?: RequestInit) =>
      getMockResponse({ jsonImpl, status, textImpl })
    );

const mockFetch = vi
  .fn()
  .mockImplementation(async (_: RequestInfo, __?: RequestInit) => mockResponse);

export default mockFetch;
