import { isErrorStatusCode } from "../apim";

class ErrorWithCode extends Error {
  public statusCode: number;
  constructor(statusCode, ...args) {
    super(...args);
    this.statusCode = statusCode;
  }
}

describe("isErrorStatusCode", () => {
  it.each`
    scenario                                   | error                                    | statusCode | expected
    ${"a null error"}                          | ${null}                                  | ${123}     | ${false}
    ${"any error"}                             | ${new Error()}                           | ${123}     | ${false}
    ${"any error with different status code"}  | ${new ErrorWithCode(456)}                | ${123}     | ${false}
    ${"any error with same status code"}       | ${new ErrorWithCode(123)}                | ${123}     | ${true}
    ${"any object with different status code"} | ${{ foo: "any field", statusCode: 456 }} | ${123}     | ${false}
    ${"any object with same status code"}      | ${{ foo: "any field", statusCode: 123 }} | ${123}     | ${true}
  `("$scenario", ({ error, statusCode, expected }) => {
    const result = isErrorStatusCode(error, statusCode);
    expect(result).toBe(expected);
  });
});
