// eslint-disable sonarjs/no-duplicate-string

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { aFiscalCode } from "../../__mocks__/mocks";
import { createMockFetch } from "../../__mocks__/node-fetch";
import { ProblemJson } from "../../generated/session-api/ProblemJson";
import { SuccessResponse } from "../../generated/session-api/SuccessResponse";
import { createClient, WithDefaultsT } from "../sessionApiClient";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

const baseUrl = "";

const anApyKey = "QWERTTYUIP12334";

const aSuccessResponse = pipe(
  { message: "ok" },
  SuccessResponse.decode,
  E.getOrElseW(err => {
    throw new Error(`Invalid mock fr SuccessResponse: ${readableReport(err)}`);
  })
);
const aProblemJson500 = pipe(
  {
    status: 400,
    title: "Server Error"
  },
  ProblemJson.decode,
  E.getOrElseW(err => {
    throw new Error(`Invalid mock fr ProblemJson400: ${readableReport(err)}`);
  })
);

const withDefaultApiKey: WithDefaultsT<"token"> = apiOperation => ({
  fiscalcode
}) => apiOperation({ fiscalcode, token: anApyKey });

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
      fiscalcode: aFiscalCode,
      token: anApyKey
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toEqual({
        status,
        value: payload
      });
    }
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
      fiscalcode: aFiscalCode
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
      fiscalcode: aFiscalCode,
      token: anApyKey
    });

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toEqual({
        status,
        value: payload
      });
    }
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
      fiscalcode: aFiscalCode
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
