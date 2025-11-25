// eslint-disable @typescript-eslint/no-explicit-any

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { RestError } from "@azure/ms-rest-js";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { assert, beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { IAzureApimConfig } from "../../utils/apim";
import { GetSubscriptionKeysHandler } from "../handler";

const aValidSubscriptionId = "valid-subscription-id" as NonEmptyString;
const aNotExistingSubscriptionId =
  "not-existing-subscription-id" as NonEmptyString;
const aBreakingApimSubscriptionId = "broken-subscription-id" as NonEmptyString;

vi.mock("@azure/arm-apimanagement");
const mockApiManagementClient = ApiManagementClient as Mock;
const mockLog = vi.fn();
const mockGetToken = vi.fn();

const mockedSubscription = {
  primaryKey: "primary-key",
  secondaryKey: "secondary-key"
};
mockApiManagementClient.mockImplementation(() => ({
  subscription: {
    listSecrets: (_: string, __: string, subscriptionId: string) => {
      if (subscriptionId === aValidSubscriptionId) {
        return Promise.resolve(mockedSubscription);
      }
      if (subscriptionId === aBreakingApimSubscriptionId) {
        return Promise.reject(new RestError("generic error", "", 500));
      }
      if (subscriptionId === aNotExistingSubscriptionId) {
        return Promise.reject(new RestError("not found", "", 404));
      }
      return assert.fail("The provided subscription id value is not handled");
    }
  }
}));
mockGetToken.mockImplementation(() => Promise.resolve(undefined));

const mockedContext = { log: { error: mockLog } };

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

describe("GetSubscriptionKeysHandler", () => {
  it("should return a not found error response if the subscription is not found", async () => {
    const getSubscriptionKeysHandler =
      GetSubscriptionKeysHandler(fakeApimConfig);
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aNotExistingSubscriptionId
    );
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return a not found error response if the API management client returns an error", async () => {
    const getSubscriptionKeysHandler =
      GetSubscriptionKeysHandler(fakeApimConfig);
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aBreakingApimSubscriptionId
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the api keys for an existing subscription", async () => {
    const getSubscriptionKeysHandler =
      GetSubscriptionKeysHandler(fakeApimConfig);
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aValidSubscriptionId
    );
    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        primary_key: mockedSubscription.primaryKey,
        secondary_key: mockedSubscription.secondaryKey
      }
    });
  });
});
