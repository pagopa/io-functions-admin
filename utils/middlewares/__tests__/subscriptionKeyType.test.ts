import * as express from "express";

import { isLeft, isRight } from "fp-ts/lib/Either";

import { SubscriptionKeyTypeEnum } from "../../../generated/definitions/SubscriptionKeyType";
import { SubscriptionKeyTypeMiddleware } from "../subscriptionKeyType";

describe("SubscriptionKeyTypeMiddleware", () => {
  it("should return a validation error if the request.body is not a valid SubscriptionKeyType", async () => {
    const request = {
      body: {}
    } as express.Request;

    const result = await SubscriptionKeyTypeMiddleware(request);

    expect(isLeft(result)).toBe(true);
  });

  it("should return the SubscriptionKeyType if the request.body is a valid SubscriptionKeyType", async () => {
    const subscriptionKeyType = {
      key_type: SubscriptionKeyTypeEnum.PRIMARY_KEY
    };
    const request = {
      body: subscriptionKeyType
    } as express.Request;

    const result = await SubscriptionKeyTypeMiddleware(request);

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(result.value).toEqual(subscriptionKeyType);
    }
  });
});
