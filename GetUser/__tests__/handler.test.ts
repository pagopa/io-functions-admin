// tslint:disable:no-any
import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  GroupContract,
  SubscriptionContract
} from "@azure/arm-apimanagement/esm/models";
import { GraphRbacManagementClient } from "@azure/graph";
import { isRight, left, right } from "fp-ts/lib/Either";
import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { UserInfo } from "../../generated/definitions/UserInfo";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import {
  groupContractToApiGroup,
  subscriptionContractToApiSubscription
} from "../../utils/conversions";
import { GetUserHandler } from "../handler";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

const fakeAdb2cCreds = {
  clientId: "client-id",
  secret: "secret",
  tenantId: "tenant-id"
};

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

const mockUserListByService = jest.fn();
const mockUserGroupList = jest.fn();
const mockUserGroupListNext = jest.fn();
const mockUserSubscriptionList = jest.fn();
const mockUserSubscriptionListNext = jest.fn();

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  user: {
    listByService: mockUserListByService
  },
  userGroup: {
    list: mockUserGroupList,
    listNext: mockUserGroupListNext
  },
  userSubscription: {
    list: mockUserSubscriptionList,
    listNext: mockUserSubscriptionListNext
  }
}));

const mockAdb2cManagementClient = GraphRbacManagementClient as jest.Mock;
mockAdb2cManagementClient.mockImplementation(() => ({
  users: {
    list: mockUserListByService
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  fromEither(right(new mockApiManagementClient()))
);

const spyOnGetAdb2cClient = jest.spyOn(
  ApimUtils,
  "getGraphRbacManagementClient"
);
spyOnGetAdb2cClient.mockImplementation(() =>
  fromEither(right(new mockAdb2cManagementClient()))
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// tslint:disable-next-line:no-big-function
describe("GetUser", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      fromLeft(Error("Error from ApiManagementClient constructor"))
    );

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the users", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.reject("Error on users list")
    );
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no user", async () => {
    mockUserListByService.mockImplementation(() => Promise.resolve([]));
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return an internal error response if the API management client list a user with an invalid name", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: "" }])
    );
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the user groups", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      Promise.reject(Error("Error on user groups list"))
    );
    mockUserSubscriptionList.mockImplementation(() => Promise.resolve([]));
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the user subscriptions", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => Promise.resolve([]));
    mockUserSubscriptionList.mockImplementation(() =>
      Promise.reject(Error("Error on user subscription list"))
    );
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists invalid groups", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      Promise.resolve([{ state: "invalid" }])
    );
    mockUserSubscriptionList.mockImplementation(() => Promise.resolve([]));
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists invalid subscriptions", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => Promise.resolve([]));
    mockUserSubscriptionList.mockImplementation(() =>
      Promise.resolve([{ groupContractType: "invalid" }])
    );
    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return all the user subscriptions and groups", async () => {
    const anApimGroupContract: GroupContract = {
      builtIn: true,
      description: "group description",
      displayName: "groupName",
      externalId: null,
      groupContractType: "custom",
      id: undefined,
      name: undefined,
      type: undefined
    };

    const anApimSubscriptionContract: SubscriptionContract = {
      allowTracing: false,
      createdDate: new Date(),
      displayName: null,
      endDate: undefined,
      expirationDate: undefined,
      id: undefined,
      name: undefined,
      notificationDate: undefined,
      ownerId: undefined,
      primaryKey: "a-primary-key",
      scope: "/apis",
      secondaryKey: "a-secondary-key",
      startDate: new Date(),
      state: "active",
      stateComment: undefined,
      type: undefined
    };

    const someValidGroups: ReadonlyArray<GroupContract> = [
      { ...anApimGroupContract, id: "group #1" },
      { ...anApimGroupContract, id: "group #2" }
    ];
    const someMoreValidGroups: ReadonlyArray<GroupContract> = [
      { ...anApimGroupContract, id: "group #3" },
      { ...anApimGroupContract, id: "group #4" }
    ];
    const someValidSubscriptions: ReadonlyArray<SubscriptionContract> = [
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#1",
        secondaryKey: "secondaryKey#1"
      },
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#2",
        secondaryKey: "secondaryKey#2"
      }
    ];
    const someMoreValidSubscriptions: ReadonlyArray<SubscriptionContract> = [
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#3",
        secondaryKey: "secondaryKey#3"
      },
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#4",
        secondaryKey: "secondaryKey#4"
      }
    ];
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => {
      const apimResponse = someValidGroups;
      // tslint:disable-next-line:no-string-literal no-object-mutation
      apimResponse["nextLink"] = "next-page";
      return Promise.resolve(apimResponse);
    });
    mockUserGroupListNext.mockImplementation(() =>
      Promise.resolve(someMoreValidGroups)
    );
    mockUserSubscriptionList.mockImplementation(() => {
      const apimResponse = someValidSubscriptions;
      // tslint:disable-next-line:no-string-literal no-object-mutation
      apimResponse["nextLink"] = "next-page";
      return Promise.resolve(apimResponse);
    });
    mockUserSubscriptionListNext.mockImplementation(() =>
      Promise.resolve(someMoreValidSubscriptions)
    );

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        groups: someValidGroups
          .concat(someMoreValidGroups)
          .map(elem => groupContractToApiGroup(elem).value),
        subscriptions: someValidSubscriptions
          .concat(someMoreValidSubscriptions)
          .map(elem => subscriptionContractToApiSubscription(elem).value)
      }
    });
    expect(isRight(UserInfo.decode((response as any).value))).toBeTruthy();
  });
});
