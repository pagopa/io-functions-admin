import * as express from "express";

import { isLeft, isRight } from "fp-ts/lib/Either";

import { aServicePayload } from "../../mocks";
import { ServicePayloadMiddleware } from "../service";

describe("ServicePayloadMiddleware", () => {
  it("should return a validation error if the request.body is not a valid Service", async () => {
    const request = {
      body: {}
    } as express.Request;

    const result = await ServicePayloadMiddleware(request);

    expect(isLeft(result)).toBe(true);
  });

  it("should return the Service if the request.body is a valid Service", async () => {
    const request = {
      body: aServicePayload
    } as express.Request;

    const result = await ServicePayloadMiddleware(request);

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual(aServicePayload);
    }
  });
});
