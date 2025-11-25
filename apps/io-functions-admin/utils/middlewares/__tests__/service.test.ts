import express from "express";
import * as E from "fp-ts/lib/Either";
import { describe, expect, it } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { aServicePayload } from "../../../__mocks__/mocks";
import { ServicePayloadMiddleware } from "../service";

describe("ServicePayloadMiddleware", () => {
  it("should return a validation error if the request.body is not a valid Service", async () => {
    const request = {
      body: {}
    } as express.Request;

    const result = await ServicePayloadMiddleware(request);

    expect(E.isLeft(result)).toBe(true);
  });

  it("should return the Service if the request.body is a valid Service", async () => {
    const request = {
      body: aServicePayload
    } as express.Request;

    const result = await ServicePayloadMiddleware(request);

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right).toEqual(aServicePayload);
    }
  });
});
