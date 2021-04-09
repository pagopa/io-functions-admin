/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-identical-functions */

import { right } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
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

// dummy but effective
const aDecodingFailure = t.number.decode("abc");

const aSuccessResponse = SuccessResponse.decode({ message: "ok" }).getOrElseL(
  err => {
    throw new Error(`Invalid mock fr SuccessResponse: ${readableReport(err)}`);
  }
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
    expect(InvalidInputFailure.decode(result).isRight()).toBe(true);
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
      expect(TransientFailure.decode(result).isRight()).toBe(false);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
    } catch (result) {
      expect(TransientFailure.decode(result).isRight()).toBe(true);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
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
      expect(TransientFailure.decode(result).isRight()).toBe(false);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
    } catch (result) {
      expect(TransientFailure.decode(result).isRight()).toBe(true);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
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
      expect(TransientFailure.decode(result).isRight()).toBe(false);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
    } catch (result) {
      expect(TransientFailure.decode(result).isRight()).toBe(true);
      expect(ApiCallFailure.decode(result).isRight()).toBe(true);
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
      expect(TransientFailure.decode(result).isRight()).toBe(false);
      expect(BadApiRequestFailure.decode(result).isRight()).toBe(true);
    } catch (result) {
      expect(TransientFailure.decode(result).isRight()).toBe(true);
      expect(BadApiRequestFailure.decode(result).isRight()).toBe(true);
    }
  });
});
