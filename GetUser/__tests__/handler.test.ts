// eslint-disable @typescript-eslint/no-explicit-any
import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  GroupCollection,
  GroupContract
} from "@azure/arm-apimanagement/esm/models";
import { GraphRbacManagementClient } from "@azure/graph";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UserInfo } from "../../generated/definitions/UserInfo";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { groupContractToApiGroup } from "../../utils/conversions";
import { GetUserHandler } from "../handler";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import { Subscription } from "../../generated/definitions/Subscription";

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

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  user: {
    listByService: mockUserListByService
  },
  userGroup: {
    list: mockUserGroupList,
    listNext: mockUserGroupListNext
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

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
    );

    const response = await getUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("still valid even if we do not pass group", () => {
    const input = { token_name: "anystring" as NonEmptyString };
    const result = UserInfo.decode(input);

    const isValidPayload = E.isRight(result);
    expect(isValidPayload).toBe(true);
  });

  it("still valid on legacy result even if we do not pass subscriptions", () => {
    const input = { token_name: "anystring" as NonEmptyString };
    // UserInfo used to contain a subscriptions optional field
    // with this test, we check whether an outdated client would break or not
    const LegacyUserInfo = t.intersection([
      UserInfo,
      t.partial({ subscriptions: t.readonlyArray(Subscription) })
    ]);

    const result = LegacyUserInfo.decode(input);

    const isValidPayload = E.isRight(result);
    expect(isValidPayload).toBe(true);
  });

  it("should return all the user groups", async () => {
    const anApimGroupContract: GroupContract = {
      builtIn: true,
      description: "group description",
      displayName: "groupName",
      externalId: undefined,
      groupContractType: "custom",
      id: undefined,
      name: undefined,
      type: undefined
    };

    const someValidGroups: Array<GroupContract> = [
      { ...anApimGroupContract, id: "group #1" },
      { ...anApimGroupContract, id: "group #2" }
    ];
    const someMoreValidGroups: Array<GroupContract> = [
      { ...anApimGroupContract, id: "group #3" },
      { ...anApimGroupContract, id: "group #4" }
    ];

    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() => {
      const apimResponse: GroupCollection = someValidGroups;
      // eslint-disable-next-line functional/immutable-data
      apimResponse["nextLink"] = "next-page";
      return Promise.resolve(apimResponse);
    });
    mockUserGroupListNext.mockImplementation(() =>
      Promise.resolve(someMoreValidGroups)
    );

    const getUserHandler = GetUserHandler(
      fakeAdb2cCreds,
      fakeServicePrincipalCredentials,
      fakeApimConfig,
      fakeAdb2cExtensionAppClientId
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
          .map(elem => pipe(groupContractToApiGroup(elem), E.toUnion))
      }
    });
    const decoded = UserInfo.decode(response);
    if (E.isRight(decoded)) {
      expect(decoded.right).toBeTruthy();
    }
  });
});
