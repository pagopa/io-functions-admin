/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions */

import { right } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { context } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mocks";
import { SuccessResponse } from "../../generated/session-api/SuccessResponse";
import { Client } from "../../utils/sessionApiClient";
import {
  ActivityInput,
  ApiCallFailure,
  BadApiRequestFailure,
  createSetUserSessionLockActivityHandler,
  InvalidInputFailure,
  TransientFailure
} from "../handler";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";

// dummy but effective
const aDecodingFailure = t.number.decode("abc");

const aSuccessResponse = pipe(
  { message: "ok" },
  SuccessResponse.decode,
  E.getOrElseW(err => {
    throw new Error(`Invalid mock fr SuccessResponse: ${readableReport(err)}`);
  })
);

const mockLockUserSession = jest.fn().mockImplementation(async () =>
  right({
    status: 200,
    value: aSuccessResponse
  })
);
const mockUnlockUserSession = jest.fn().mockImplementation(async () =>
  right({
    status: 200,
    value: aSuccessResponse
  })
);

const mockClient = {
  lockUserSession: mockLockUserSession,
  unlockUserSession: mockUnlockUserSession
} as Client<"token">;

describe("createSetUserSessionLockActivityHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", async () => {
    const handler = createSetUserSessionLockActivityHandler(mockClient);

    const result = await handler(context, "invalid");
    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);
  });

  it("should execute correct api operation when action is LOCK", async () => {
    const handler = createSetUserSessionLockActivityHandler(mockClient);

    await handler(
      context,
      ActivityInput.encode({
        action: "LOCK",
        fiscalCode: aFiscalCode
      })
    );
    expect(mockLockUserSession).toHaveBeenCalledTimes(1);
    expect(mockUnlockUserSession).not.toHaveBeenCalled();
  });

  it("should execute correct api operation when action is UNLOCK", async () => {
    const handler = createSetUserSessionLockActivityHandler(mockClient);

    await handler(
      context,
      ActivityInput.encode({
        action: "UNLOCK",
        fiscalCode: aFiscalCode
      })
    );
    expect(mockUnlockUserSession).toHaveBeenCalledTimes(1);
    expect(mockLockUserSession).not.toHaveBeenCalled();
  });

  it("should fail when api operation fails", async () => {
    mockLockUserSession.mockImplementationOnce(async () => {
      throw new Error("any error");
    });

    const handler = createSetUserSessionLockActivityHandler(mockClient);

    // the handler may throw depending on what we consider to be a transient failure
    // we wrap in a try/catch so we can test both cases
    try {
      const result = await handler(
        context,
        ActivityInput.encode({
          action: "LOCK",
          fiscalCode: aFiscalCode
        })
      );
      expect(E.isRight(TransientFailure.decode(result))).toBe(false);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    } catch (result) {
      expect(E.isRight(TransientFailure.decode(result))).toBe(true);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    }
  });

  it("should fail when api operation returns an unparsable payload", async () => {
    mockLockUserSession.mockImplementationOnce(async () => aDecodingFailure);

    const handler = createSetUserSessionLockActivityHandler(mockClient);

    // the handler may throw depending on what we consider to be a transient failure
    // we wrap in a try/catch so we can test both cases
    try {
      const result = await handler(
        context,
        ActivityInput.encode({
          action: "LOCK",
          fiscalCode: aFiscalCode
        })
      );
      expect(E.isRight(TransientFailure.decode(result))).toBe(false);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    } catch (result) {
      expect(E.isRight(TransientFailure.decode(result))).toBe(true);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    }
  });

  it("should fail when api operation returns an error response", async () => {
    mockLockUserSession.mockImplementationOnce(async () =>
      right({
        status: 500
      })
    );

    const handler = createSetUserSessionLockActivityHandler(mockClient);

    // the handler may throw depending on what we consider to be a transient failure
    // we wrap in a try/catch so we can test both cases
    try {
      const result = await handler(
        context,
        ActivityInput.encode({
          action: "LOCK",
          fiscalCode: aFiscalCode
        })
      );
      expect(E.isRight(TransientFailure.decode(result))).toBe(false);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    } catch (result) {
      expect(E.isRight(TransientFailure.decode(result))).toBe(true);
      expect(E.isRight(ApiCallFailure.decode(result))).toBe(true);
    }
  });

  it("should fail when api operation is called badly", async () => {
    mockLockUserSession.mockImplementationOnce(async () =>
      right({
        status: 400
      })
    );

    const handler = createSetUserSessionLockActivityHandler(mockClient);

    // the handler may throw depending on what we consider to be a transient failure
    // we wrap in a try/catch so we can test both cases
    try {
      const result = await handler(
        context,
        ActivityInput.encode({
          action: "LOCK",
          fiscalCode: aFiscalCode
        })
      );
      expect(E.isRight(TransientFailure.decode(result))).toBe(false);
      expect(E.isRight(BadApiRequestFailure.decode(result))).toBe(true);
    } catch (result) {
      expect(E.isRight(TransientFailure.decode(result))).toBe(true);
      expect(E.isRight(BadApiRequestFailure.decode(result))).toBe(true);
    }
  });
});
