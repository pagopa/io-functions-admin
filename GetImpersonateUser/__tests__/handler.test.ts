import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GroupContract } from "@azure/arm-apimanagement/esm/models";
import * as TE from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { GetImpersonateServiceHandler } from "../handler";
import { RestError } from "@azure/ms-rest-js";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

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

const fakeUserName = "a-non-empty-string";

const mockUserGroupList = jest.fn();
const mockUserGroupListNext = jest.fn();
const mockUserSubscriptionGet = jest.fn();

const aValidSubscriptionId = "valid-subscription-id" as NonEmptyString;
const aNotExistingSubscriptionId = "not-existing-subscription-id" as NonEmptyString;
const aBreakingApimSubscriptionId = "broken-subscription-id" as NonEmptyString;
const aValidSubscriptionIdWithouthOwner = "no-owner-subscription-id" as NonEmptyString;

const mockedSubscription = {
  ownerId: "/users/userId"
};

const mockedSubscriptionWithoutOwner = {
  displayName: "without-woner",
  ownerId: undefined
};

const mockApiManagementClient = ApiManagementClient as jest.Mock;

mockApiManagementClient.mockImplementation(() => ({
  userGroup: {
    list: mockUserGroupList,
    listNext: mockUserGroupListNext
  },
  subscription: {
    get: mockUserSubscriptionGet
  }
}));

mockUserSubscriptionGet.mockImplementation((_, __, subscriptionId) => {
  if (subscriptionId === aValidSubscriptionId) {
    return Promise.resolve(mockedSubscription);
  }
  if (subscriptionId === aValidSubscriptionIdWithouthOwner) {
    return Promise.resolve(mockedSubscriptionWithoutOwner);
  }
  if (subscriptionId === aBreakingApimSubscriptionId) {
    return Promise.reject(new RestError("generic error", "", 500));
  }
  if (subscriptionId === aNotExistingSubscriptionId) {
    return Promise.reject(new RestError("not found", "", 404));
  }
  return fail(Error("The provided subscription id value is not handled"));
});

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  TE.of(new mockApiManagementClient())
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("GetImpersonateServiceHandler", () => {
  it("GIVEN a not working APIM client WHEN call the handler THEN an Internel Error is returned", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error from ApiManagementClient constructor"))
    );

    const getImpersonateServiceHandler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getImpersonateServiceHandler(
      mockedContext as any,
      undefined,
      undefined
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("GIVEN a not working APIM server WHEN call the handler THEN an Internal Error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await handler(
      mockedContext as any,
      undefined,
      aBreakingApimSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("GIVEN a subscripion without owner WHEN call the handler THEN an Internal Error error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await handler(
      mockedContext as any,
      undefined,
      aValidSubscriptionIdWithouthOwner
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("GIVEN a not existing subscripion id WHEN call the handler THEN an Not Found error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await handler(
      mockedContext as any,
      undefined,
      aNotExistingSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("GIVEN an existing subscripion id WHEN call the handler THEN a proper Impersonated Service is returned", async () => {
    const anApimGroupContract: GroupContract = {
      description: "group description",
      displayName: "groupName"
    };

    const someValidGroups: ReadonlyArray<GroupContract> = [
      { ...anApimGroupContract, id: "group #1" },
      { ...anApimGroupContract, id: "group #2" }
    ];
    const someMoreValidGroups: ReadonlyArray<GroupContract> = [
      { ...anApimGroupContract, id: "group #3" },
      { ...anApimGroupContract, id: "group #4" }
    ];

    mockUserGroupList.mockImplementation(() => {
      const apimResponse = someValidGroups;
      // eslint-disable-next-line functional/immutable-data
      apimResponse["nextLink"] = "next-page";
      return Promise.resolve(apimResponse);
    });
    mockUserGroupListNext.mockImplementation(() =>
      Promise.resolve(someMoreValidGroups)
    );

    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await handler(
      mockedContext as any,
      undefined as any,
      aValidSubscriptionId as any
    );

    expect(response).toEqual(
      expect.objectContaining({
        kind: "IResponseSuccessJson",
        value: {
          service_id: "valid-subscription-id",
          user_groups: "groupName,groupName,groupName,groupName"
        }
      })
    );
  });
});
