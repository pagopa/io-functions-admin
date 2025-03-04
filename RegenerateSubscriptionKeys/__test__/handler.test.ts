// eslint-disable @typescript-eslint/no-explicit-any

jest.mock("@azure/ms-rest-nodeauth", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention
  __esModule: true,
  ...jest.requireActual("@azure/ms-rest-nodeauth")
}));

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { RestError } from "@azure/ms-rest-js";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { SubscriptionKeyTypeEnum } from "../../generated/definitions/SubscriptionKeyType";
import { IAzureApimConfig } from "../../utils/apim";
import { RegenerateSubscriptionKeysHandler } from "../handler";

const mockLoginWithServicePrincipalSecret = jest.spyOn(
  msRestNodeAuth,
  "loginWithServicePrincipalSecret"
);

const aValidSubscriptionId = "valid-subscription-id" as NonEmptyString;
const aNotExistingSubscriptionId = "not-existing-subscription-id" as NonEmptyString;
const aBreakingApimSubscriptionId = "broken-subscription-id" as NonEmptyString;

jest.mock("@azure/arm-apimanagement");
const mockApiManagementClient = ApiManagementClient as jest.Mock;
const mockLog = jest.fn();
const mockGetToken = jest.fn();

const mockedSubscription = {
  primaryKey: "primary-key",
  secondaryKey: "secondary-key"
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const regenerateKeyImplementation = (
  _: string,
  __: string,
  subscriptionId: string
) => {
  if (subscriptionId === aValidSubscriptionId) {
    return Promise.resolve();
  }
  if (subscriptionId === aBreakingApimSubscriptionId) {
    return Promise.reject(new RestError("generic error", "", 500));
  }
  if (subscriptionId === aNotExistingSubscriptionId) {
    return Promise.reject(new RestError("not found", "", 404));
  }
  return fail(Error("The provided subscription id value is not handled"));
};

const mockRegeneratePrimaryKey = jest.fn();
mockRegeneratePrimaryKey.mockImplementation(regenerateKeyImplementation);
const mockRegenerateSecondaryKey = jest.fn();
mockRegenerateSecondaryKey.mockImplementation(regenerateKeyImplementation);

mockApiManagementClient.mockImplementation(() => ({
  subscription: {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
      return fail(Error("The provided subscription id value is not handled"));
    },
    regeneratePrimaryKey: mockRegeneratePrimaryKey,
    regenerateSecondaryKey: mockRegenerateSecondaryKey
  }
}));
mockLoginWithServicePrincipalSecret.mockImplementation(() =>
  Promise.resolve({ getToken: mockGetToken })
);
mockGetToken.mockImplementation(() => Promise.resolve(undefined));

const mockedContext = { log: { error: mockLog } };

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

describe("RegenerateSubscriptionKeysHandler", () => {
  afterEach(() => {
    mockLoginWithServicePrincipalSecret.mockClear();
    mockRegeneratePrimaryKey.mockClear();
    mockRegenerateSecondaryKey.mockClear();
  });

  it("should return a not found error response if the subscription is not found", async () => {
    const regenerateSubscriptionKeysHandler = RegenerateSubscriptionKeysHandler(
      fakeApimConfig
    );
    const response = await regenerateSubscriptionKeysHandler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
      aNotExistingSubscriptionId,
      { key_type: SubscriptionKeyTypeEnum.PRIMARY_KEY }
    );
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return a not found error response if the API management client returns an error", async () => {
    const regenerateSubscriptionKeysHandler = RegenerateSubscriptionKeysHandler(
      fakeApimConfig
    );
    const response = await regenerateSubscriptionKeysHandler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
      aBreakingApimSubscriptionId,
      { key_type: SubscriptionKeyTypeEnum.PRIMARY_KEY }
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should regenerate the requested api keys for an existing subscription", async () => {
    const regenerateSubscriptionKeysHandler = RegenerateSubscriptionKeysHandler(
      fakeApimConfig
    );
    // Primary key regeneration
    const firstResponse = await regenerateSubscriptionKeysHandler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
      aValidSubscriptionId,
      { key_type: SubscriptionKeyTypeEnum.PRIMARY_KEY }
    );
    expect(firstResponse).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        primary_key: mockedSubscription.primaryKey,
        secondary_key: mockedSubscription.secondaryKey
      }
    });
    expect(mockRegeneratePrimaryKey).toHaveBeenCalled();
    expect(mockRegenerateSecondaryKey).not.toHaveBeenCalled();

    mockRegeneratePrimaryKey.mockClear();
    mockRegenerateSecondaryKey.mockClear();

    // Secondary key regeneration
    const secondResponse = await regenerateSubscriptionKeysHandler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockedContext as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
      aValidSubscriptionId,
      { key_type: SubscriptionKeyTypeEnum.SECONDARY_KEY }
    );
    expect(secondResponse).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        primary_key: mockedSubscription.primaryKey,
        secondary_key: mockedSubscription.secondaryKey
      }
    });
    expect(mockRegeneratePrimaryKey).not.toHaveBeenCalled();
    expect(mockRegenerateSecondaryKey).toHaveBeenCalled();
  });
});
