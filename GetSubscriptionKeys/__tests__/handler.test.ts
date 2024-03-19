// eslint-disable @typescript-eslint/no-explicit-any

jest.mock("@azure/ms-rest-nodeauth", () => ({
  __esModule: true,
  ...jest.requireActual("@azure/ms-rest-nodeauth")
}));

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { RestError } from "@azure/ms-rest-js";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { GetSubscriptionKeysHandler } from "../handler";

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
mockApiManagementClient.mockImplementation(() => ({
  subscription: {
    get: (_: string, __: string, subscriptionId: string) => {
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
    }
  }
}));
mockLoginWithServicePrincipalSecret.mockImplementation(() => {
  return Promise.resolve({ getToken: mockGetToken });
});
mockGetToken.mockImplementation(() => {
  return Promise.resolve(undefined);
});

const mockedContext = { log: { error: mockLog } };

const fakeServicePrincipalCredentials: IServicePrincipalCreds = {
  clientId: "client-id",
  secret: "secret",
  tenantId: "tenant-id"
};

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

describe("GetSubscriptionKeysHandler", () => {
  afterEach(() => {
    mockLoginWithServicePrincipalSecret.mockClear();
  });

  it("should return a not found error response if the subscription is not found", async () => {
    const getSubscriptionKeysHandler = GetSubscriptionKeysHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aNotExistingSubscriptionId
    );
    expect(msRestNodeAuth.loginWithServicePrincipalSecret).toBeCalled();
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return a not found error response if the API management client returns an error", async () => {
    const getSubscriptionKeysHandler = GetSubscriptionKeysHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aBreakingApimSubscriptionId
    );
    expect(msRestNodeAuth.loginWithServicePrincipalSecret).toBeCalled();
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the api keys for an existing subscription", async () => {
    const getSubscriptionKeysHandler = GetSubscriptionKeysHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    const response = await getSubscriptionKeysHandler(
      mockedContext as any,
      undefined as any,
      aValidSubscriptionId
    );
    expect(msRestNodeAuth.loginWithServicePrincipalSecret).toBeCalled();
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
