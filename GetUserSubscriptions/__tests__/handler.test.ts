// eslint-disable @typescript-eslint/no-explicit-any
import {
  ApiManagementClient,
  GroupContract,
  SubscriptionContract
} from "@azure/arm-apimanagement";

import { GraphRbacManagementClient } from "@azure/graph";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { UserInfoAndSubscriptions } from "../../generated/definitions/UserInfoAndSubscriptions";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import {
  groupContractToApiGroup,
  subscriptionContractToApiSubscription
} from "../../utils/conversions";
import { ArrayToAsyncIterable } from "../../utils/testSupport";
import { GetUserSubscriptionsHandler } from "../handler";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

const fakeAdb2cCreds = {
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
const mockGraphRbacUserList = jest.fn();
const mockUserGroupList = jest.fn();
const mockUserSubscriptionList = jest.fn();

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  user: {
    listByService: mockUserListByService
  },
  userGroup: {
    list: mockUserGroupList
  },
  userSubscription: {
    list: mockUserSubscriptionList
  }
}));

const mockAdb2cManagementClient = GraphRbacManagementClient as jest.Mock;
mockAdb2cManagementClient.mockImplementation(() => ({
  users: {
    list: mockGraphRbacUserList
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  TE.of(new mockApiManagementClient())
);

const spyOnGetAdb2cClient = jest.spyOn(
  ApimUtils,
  "getGraphRbacManagementClient"
);
spyOnGetAdb2cClient.mockImplementation(() =>
  TE.of(new mockAdb2cManagementClient())
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

const fakeAdb2cExtensionAppClientId = "extension-client-id" as NonEmptyString;

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("GetUser", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error from ApiManagementClient constructor"))
    );

    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the users", async () => {
    mockUserListByService.mockImplementation(() => {
      return {
        next: () => Promise.reject(new Error("Error on users list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    });
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no user", async () => {
    mockUserListByService.mockImplementation(() => ArrayToAsyncIterable([]));
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return an internal error response if the API management client list a user with an invalid name", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: "" }])
    );
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the user groups", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => {
      return {
        next: () => Promise.reject(new Error("Error on user groups list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    });

    mockUserSubscriptionList.mockImplementation(() => ArrayToAsyncIterable([]));
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the user subscriptions", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => ArrayToAsyncIterable([]));
    mockUserSubscriptionList.mockImplementation(() => {
      return {
        next: () =>
          Promise.reject(new Error("Error on user subscription list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    });
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists invalid groups", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      ArrayToAsyncIterable([{ state: "invalid" }])
    );
    mockUserSubscriptionList.mockImplementation(() => ArrayToAsyncIterable([]));
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists invalid subscriptions", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => ArrayToAsyncIterable([]));
    mockUserSubscriptionList.mockImplementation(() =>
      ArrayToAsyncIterable([{ groupContractType: "invalid" }])
    );
    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
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
      externalId: undefined,
      typePropertiesType: "custom",
      id: undefined,
      name: undefined,
      type: undefined
    };

    const anApimSubscriptionContract: SubscriptionContract = {
      allowTracing: false,
      createdDate: new Date(),
      displayName: undefined,
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

    const someValidGroups: Array<GroupContract> = [
      { ...anApimGroupContract, id: "group #1" },
      { ...anApimGroupContract, id: "group #2" },
      { ...anApimGroupContract, id: "group #3" },
      { ...anApimGroupContract, id: "group #4" }
    ];

    const someValidSubscriptions: Array<SubscriptionContract> = [
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#1",
        secondaryKey: "secondaryKey#1"
      },
      {
        ...anApimSubscriptionContract,
        primaryKey: "primaryKey#2",
        secondaryKey: "secondaryKey#2"
      },
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
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockGraphRbacUserList.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      ArrayToAsyncIterable(someValidGroups)
    );
    mockUserSubscriptionList.mockImplementation(() =>
      ArrayToAsyncIterable(someValidSubscriptions)
    );

    const getUserSubscriptionsHandler = GetUserSubscriptionsHandler(
      fakeAdb2cCreds,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserSubscriptionsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        groups: someValidGroups.map(elem =>
          pipe(groupContractToApiGroup(elem), E.toUnion)
        ),
        subscriptions: someValidSubscriptions.map(elem =>
          pipe(subscriptionContractToApiSubscription(elem), E.toUnion)
        )
      }
    });
    const decoded = UserInfoAndSubscriptions.decode(response);
    if (E.isRight(decoded)) {
      expect(decoded.right).toBeTruthy();
    }
  });
});
