import { createClient } from "../sessionApiClient";
import nodeFetch from "node-fetch";
import { createMockFetch } from "../../__mocks__/node-fetch";
import { aFiscalCode } from "../../__mocks__/mocks";
import { SuccessResponse } from "../../generated/session-api/SuccessResponse";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ProblemJson } from "../../generated/session-api/ProblemJson";

const baseUrl = "";

const aSuccessResponse = SuccessResponse.decode({ message: "ok" }).getOrElseL(
  err => {
    throw new Error(`Invalid mock fr SuccessResponse: ${readableReport(err)}`);
  }
);

const aProblemJson400 = ProblemJson.decode({
  status: 400,
  title: "Bad Request"
}).getOrElseL(err => {
  throw new Error(`Invalid mock fr ProblemJson400: ${readableReport(err)}`);
});

const aProblemJson500 = ProblemJson.decode({
  status: 400,
  title: "Server Error"
}).getOrElseL(err => {
  throw new Error(`Invalid mock fr ProblemJson400: ${readableReport(err)}`);
});

describe("sessionApiClient#lockUserSession", () => {
  it.each`
    name                | status | payload
    ${"Success"}        | ${200} | ${aSuccessResponse}
    ${"Not Found"}      | ${404} | ${undefined}
    ${"Server Error"}   | ${500} | ${aProblemJson500}
    ${"Bad Request"}    | ${400} | ${aProblemJson400}
    ${"Not Authorized"} | ${401} | ${undefined}
  `("should handle $name response", async ({ status, payload }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient({ baseUrl, fetchApi });

    const result = await client.lockUserSession({ fiscalCode: aFiscalCode });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({
      status,
      value: payload
    });
  });
});

describe("sessionApiClient#unlockUserSession", () => {
  it.each`
    name                | status | payload
    ${"Success"}        | ${200} | ${aSuccessResponse}
    ${"Server Error"}   | ${500} | ${aProblemJson500}
    ${"Bad Request"}    | ${400} | ${aProblemJson400}
    ${"Not Authorized"} | ${401} | ${undefined}
  `("should handle $name response", async ({ status, payload }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient({ baseUrl, fetchApi });

    const result = await client.unlockUserSession({ fiscalCode: aFiscalCode });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({
      status,
      value: payload
    });
  });
});
