// eslint-disable sonarjs/no-duplicate-string

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { assert, beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { aFiscalCode } from "../../__mocks__/mocks";
import { createMockFetch } from "../../__mocks__/node-fetch";
import { createClient } from "../sm-internal/client";
import { ProblemJson } from "../sm-internal/ProblemJson";
import { SuccessResponse } from "../sm-internal/SuccessResponse";

const baseUrl = "";

const anApiKey = "QWERTTYUIP12334";

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

describe("sessionApiClient#lockUserSession", () => {
  it.each`
    name                | status | payload
    ${"Success"}        | ${200} | ${aSuccessResponse}
    ${"Not Found"}      | ${404} | ${undefined}
    ${"Server Error"}   | ${500} | ${aProblemJson500}
    ${"Bad Request"}    | ${400} | ${undefined}
    ${"Not Authorized"} | ${401} | ${undefined}
  `("should handle $name response", async ({ payload, status }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient({ baseUrl, fetchApi });

    const result = await client.lockUserSession({
      ApiKeyAuth: anApiKey,
      fiscalCode: aFiscalCode,
      token: anApiKey
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

    const client = createClient<"ApiKeyAuth">({
      baseUrl,
      fetchApi,
      withDefaults: op => params =>
        op({
          ...params,
          ApiKeyAuth: anApiKey,
          token: anApiKey
        })
    });

    await client.lockUserSession({
      fiscalCode: aFiscalCode
    });

    // fetchApi is actually a jest.Mock, can be spied
    const spiedFetch = fetchApi as Mock;

    // check that arguments are correctly passed to fetch
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(aFiscalCode),
      expect.any(Object)
    );
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(anApiKey),
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
  `("should handle $name response", async ({ payload, status }) => {
    const fetchApi = createMockFetch({
      jsonImpl: async () => payload,
      status
    });
    const client = createClient<"ApiKeyAuth">({
      baseUrl,
      fetchApi,
      withDefaults: op => params =>
        op({
          ...params,
          ApiKeyAuth: anApiKey,
          token: anApiKey
        })
    });

    const result = await client.unlockUserSession({
      fiscalCode: aFiscalCode
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

    const client = createClient<"ApiKeyAuth">({
      baseUrl,
      fetchApi,
      withDefaults: op => params =>
        op({
          ...params,
          ApiKeyAuth: anApiKey,
          token: anApiKey
        })
    });

    await client.unlockUserSession({
      fiscalCode: aFiscalCode
    });

    // fetchApi is actually a Mock, can be spied
    const spiedFetch = fetchApi as Mock;

    // check that arguments are correctly passed to fetch
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(aFiscalCode),
      expect.any(Object)
    );
    expect(spiedFetch).toHaveBeenCalledWith(
      expect.stringContaining(anApiKey),
      expect.any(Object)
    );
  });
});
