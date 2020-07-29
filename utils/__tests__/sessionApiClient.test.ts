// tslint:disable: no-duplicate-string

import { readableReport } from "italia-ts-commons/lib/reporters";
import { aFiscalCode } from "../../__mocks__/mocks";
import { createMockFetch } from "../../__mocks__/node-fetch";
import { ProblemJson } from "../../generated/session-api/ProblemJson";
import { SuccessResponse } from "../../generated/session-api/SuccessResponse";
import { createClient, WithDefaultsT } from "../sessionApiClient";

const baseUrl = "";

const anApyKey = "QWERTTYUIP12334";

const aSuccessResponse = SuccessResponse.decode({ message: "ok" }).getOrElseL(
  err => {
    throw new Error(`Invalid mock fr SuccessResponse: ${readableReport(err)}`);
  }
);
const aProblemJson500 = ProblemJson.decode({
  status: 400,
  title: "Server Error"
}).getOrElseL(err => {
  throw new Error(`Invalid mock fr ProblemJson400: ${readableReport(err)}`);
});

const withDefaultApiKey: WithDefaultsT<"token"> = apiOperation => ({
  fiscalCode
}) => apiOperation({ fiscalCode, token: anApyKey });

describe("sessionApiClient#lockUserSession", () => {
  it.each`
    name                | status | payload
    ${"Success"}        | ${200} | ${aSuccessResponse}
    ${"Not Found"}      | ${404} | ${undefined}
    ${"Server Error"}   | ${500} | ${aProblemJson500}
    ${"Bad Request"}    | ${400} | ${undefined}
    ${"Not Authorized"} | ${401} | ${undefined}
  `("should handle $name response", async ({ status, payload }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient({ baseUrl, fetchApi });

    const result = await client.lockUserSession({
      fiscalCode: aFiscalCode,
      token: anApyKey
    });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({
      status,
      value: payload
    });
  });

  it("should work with a default parameter", async () => {
    // just any working case
    const fetchApi = createMockFetch({
      jsonImpl: async () => aSuccessResponse,
      status: 200
    });

    const client = createClient({
      baseUrl,
      fetchApi,
      withDefaults: withDefaultApiKey
    });

    await client.lockUserSession({
      fiscalCode: aFiscalCode
    });

    // fetchApi is actually a jest.Mock, can be spied
    const spiedFetch = fetchApi as jest.Mock;

    // check that arguments are correctly passed to fetch
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(aFiscalCode),
      expect.any(Object)
    );
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(anApyKey),
      expect.any(Object)
    );
  });
});

describe("sessionApiClient#unlockUserSession", () => {
  it.each`
    name                | status | payload
    ${"Success"}        | ${200} | ${aSuccessResponse}
    ${"Server Error"}   | ${500} | ${aProblemJson500}
    ${"Bad Request"}    | ${400} | ${undefined}
    ${"Not Authorized"} | ${401} | ${undefined}
  `("should handle $name response", async ({ status, payload }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient({ baseUrl, fetchApi });

    const result = await client.unlockUserSession({
      fiscalCode: aFiscalCode,
      token: anApyKey
    });

    expect(result.isRight()).toBe(true);
    expect(result.value).toEqual({
      status,
      value: payload
    });
  });

  it("should work with a default parameter", async () => {
    // just any working case
    const fetchApi = createMockFetch({
      jsonImpl: async () => aSuccessResponse,
      status: 200
    });

    const client = createClient({
      baseUrl,
      fetchApi,
      withDefaults: withDefaultApiKey
    });

    await client.unlockUserSession({
      fiscalCode: aFiscalCode
    });

    // fetchApi is actually a jest.Mock, can be spied
    const spiedFetch = fetchApi as jest.Mock;

    // check that arguments are correctly passed to fetch
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(aFiscalCode),
      expect.any(Object)
    );
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(anApyKey),
      expect.any(Object)
    );
  });
});
