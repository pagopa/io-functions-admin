import { withRetry } from "../retry";

const aGoodResult = 42;
const aBadResult = "bad things happen here";
const anAlwaysGoodOperation = jest.fn(() => Promise.resolve(aGoodResult));
const anAlwaysBadOperation = jest.fn(() => Promise.reject(aBadResult));
const anOperationGoodAtAttemptNth = (n: number) => {
  let count = 0;
  return jest.fn(() => {
    count++;
    if (count < n) {
      return Promise.reject(aBadResult);
    } else {
      return Promise.resolve(aGoodResult);
    }
  });
};

const sleep = ms => new Promise(done => setTimeout(done, ms));

beforeEach(() => {
  jest.clearAllMocks();
});

// check test helper
describe("anOperationGoodAtAttemptNth", () => {
  it("works as intended", () => {
    const op = anOperationGoodAtAttemptNth(3);
    const result1 = op();
    const result2 = op();
    const result3 = op();
    const result4 = op();

    expect(result1).rejects.toEqual(aBadResult);
    expect(result2).rejects.toEqual(aBadResult);
    expect(result3).resolves.toEqual(aGoodResult);
    expect(result4).resolves.toEqual(aGoodResult);
  });
});

describe("withRetry", () => {
  it("should return a promise", async () => {
    const retriable = withRetry()(anAlwaysGoodOperation);
    const result = retriable();

    // check is a Promise
    expect(
      result instanceof Object &&
        "then" in result &&
        typeof result.then === "function"
    ).toBe(true);

    const value = await result;
    expect(value).toEqual(aGoodResult);
    expect(anAlwaysGoodOperation).toBeCalledTimes(1);
  });

  it("should fail when the operations always fails", async () => {
    const operation = anAlwaysBadOperation;
    const retriable = withRetry()(operation);
    const result = retriable();

    try {
      await result;
      fail("expected to throw");
    } catch (error) {
      expect(error).toEqual(aBadResult);
      expect(operation).toBeCalledTimes(3);
    }
  });

  it("should fail when the operations fails more than retried times", async () => {
    const operation = anOperationGoodAtAttemptNth(4);
    const retriable = withRetry({ maxAttempts: 3 })(operation);
    const result = retriable();

    try {
      await result;
      fail("expected to throw");
    } catch (error) {
      expect(error).toEqual(aBadResult);
      expect(operation).toBeCalledTimes(3);
    }
  });

  it("should succeed when the operations fails less than retried times", async () => {
    const operation = anOperationGoodAtAttemptNth(2);
    const retriable = withRetry({ maxAttempts: 3 })(operation);
    const result = retriable();

    const value = await result;

    expect(value).toEqual(aGoodResult);
    expect(operation).toBeCalledTimes(2);
  });

  it("should not retry if whileCondition is not met", async () => {
    const operation = anOperationGoodAtAttemptNth(2);
    const retriable = withRetry({
      maxAttempts: 3,
      whileCondition: () => false
    })(operation);
    const result = retriable();

    try {
      await result;
      fail("expected to throw");
    } catch (error) {
      expect(error).toEqual(aBadResult);
      expect(operation).toBeCalledTimes(1);
    }
  });

  it("should wait between invocations if a delay is provided", async () => {
    const operation = anAlwaysBadOperation;
    const waitFor = 1000;
    const retriable = withRetry({ delayMS: waitFor })(operation);
    const _ = retriable();
    _.catch(e => e);
    
    expect(operation).toBeCalledTimes(1);
    await sleep(waitFor * 1.01);

    expect(operation).toBeCalledTimes(2);
  });
});
