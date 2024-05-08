// eslint-disable @typescript-eslint/no-explicit-any

import { ApiManagementClient, GroupContract } from "@azure/arm-apimanagement";
import { right } from "fp-ts/lib/Either";
import { fromEither, left } from "fp-ts/lib/TaskEither";
import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { EmailAddress } from "../../generated/definitions/EmailAddress";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { UpdateUserGroupHandler } from "../handler";
import {
  ArrayToAsyncIterable,
  ReadonlyArrayToAsyncIterable
} from "../../utils/testSupport";

jest.mock("@azure/arm-apimanagement");

const fakeExistingGroups: ReadonlyArray<GroupContract> = [
  {
    displayName: UserGroup.ApiDebugRead,
    name: UserGroup.ApiDebugRead.toLowerCase()
  },
  {
    displayName: UserGroup.ApiInfoRead,
    name: UserGroup.ApiInfoRead.toLowerCase()
  },
  {
    displayName: UserGroup.ApiMessageList,
    name: UserGroup.ApiMessageList.toLowerCase()
  },
  {
    displayName: UserGroup.ApiServiceRead,
    name: UserGroup.ApiServiceRead.toLowerCase()
  },
  {
    displayName: UserGroup.ApiPublicServiceList,
    name: UserGroup.ApiPublicServiceList.toLowerCase()
  },
  {
    displayName: UserGroup.ApiSubscriptionsFeedRead,
    name: UserGroup.ApiSubscriptionsFeedRead.toLowerCase()
  },
  {
    displayName: UserGroup.ApiDevelopmentProfileWrite,
    name: UserGroup.ApiDevelopmentProfileWrite.toLowerCase()
  }
];

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
const fakeUserEmail = "user@example.com" as EmailAddress;

const mockGroupListByService = jest.fn();
const mockGroupListByServiceNext = jest.fn();
const mockGroupUserCreate = jest.fn();
const mockGroupUserDeleteMethod = jest.fn();
const mockUserListByService = jest.fn();
const mockUserGroupList = jest.fn();
const mockUserGroupListNext = jest.fn();

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  group: {
    listByService: mockGroupListByService,
    listByServiceNext: mockGroupListByServiceNext
  },
  groupUser: {
    create: mockGroupUserCreate,
    delete: mockGroupUserDeleteMethod
  },
  user: {
    listByService: mockUserListByService
  },
  userGroup: {
    list: mockUserGroupList,
    listNext: mockUserGroupListNext
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  fromEither(right(new mockApiManagementClient()))
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("UpdateUserGroups", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      left(Error("Error from ApiManagementClient constructor"))
    );

    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the users", async () => {
    mockUserListByService.mockReturnValue(() => [
      Promise.reject("Error on users list")
    ]);
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no user", async () => {
    mockUserListByService.mockImplementation(() => ({
      next: async () => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]() {
        return this;
      }
    }));
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return an internal error response if the API management client list a user with an invalid name", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: "" }])
    );
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the current user groups", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserListByService.mockImplementation(() => {
      return {
        next: () => Promise.reject(new Error("Error on user groups list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    });
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the groups", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      Promise.resolve(fakeExistingGroups)
    );
    mockGroupListByService.mockImplementation(() => {
      return {
        next: () => Promise.reject(new Error("Error on user groups list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      };
    });

    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a bad request error response if some groups in the request payload do not exist", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );

    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: ["invalid group"] }
    );

    expect(response.kind).toEqual("IResponseErrorValidation");
  });

  it("should return an internal error response if the API management client can not associate the user with a group", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups.slice(0, 3))
    );

    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );

    mockGroupUserCreate.mockImplementation(() =>
      Promise.reject("Error on group user create")
    );
    mockGroupUserDeleteMethod.mockImplementation(() => Promise.resolve());
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not remove an association of the user with a group", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups.slice(0, 3))
    );
    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    mockGroupUserCreate.mockImplementation(() => Promise.resolve());
    mockGroupUserDeleteMethod.mockImplementation(() =>
      Promise.reject("Error on group user delete method")
    );
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the updated user groups", async () => {
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList
      .mockImplementationOnce(() =>
        ReadonlyArrayToAsyncIterable(fakeExistingGroups.slice(0, 3))
      )
      .mockImplementationOnce(() => {
        return {
          next: () => Promise.reject(new Error("Error on user groups list")),
          [Symbol.asyncIterator]() {
            return this;
          }
        };
      });

    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    mockGroupUserCreate.mockImplementation(() => Promise.resolve());
    mockGroupUserDeleteMethod.mockImplementation(() => Promise.resolve());
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists some invalid updated user groups", async () => {
    const updatedGroups = fakeExistingGroups.slice(1, 4);
    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList
      .mockImplementationOnce(() =>
        ReadonlyArrayToAsyncIterable(fakeExistingGroups.slice(0, 3))
      )
      .mockImplementationOnce(() =>
        ArrayToAsyncIterable(
          updatedGroups.slice(-1, 1).concat([{ displayName: undefined as any }])
        )
      );
    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    mockGroupUserCreate.mockImplementation(() => Promise.resolve());
    mockGroupUserDeleteMethod.mockImplementation(() => Promise.resolve());
    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: updatedGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should update the user groups and return their updated list", async () => {
    const userCurrentGroups = fakeExistingGroups.slice(0, 4);
    const groupsToBeRemoved = userCurrentGroups.slice(0, 2);
    const groupsToBeAssociated = fakeExistingGroups.slice(4, 6);
    const updatedGroups = fakeExistingGroups.slice(2, 6);

    mockUserListByService.mockImplementation(() =>
      ArrayToAsyncIterable([{ name: fakeUserName }])
    );
    mockUserGroupList
      .mockImplementationOnce(() => ArrayToAsyncIterable(userCurrentGroups))
      .mockImplementationOnce(() => ArrayToAsyncIterable(updatedGroups));
    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );

    mockGroupUserCreate.mockImplementation(() => Promise.resolve());
    mockGroupUserDeleteMethod.mockImplementation(() => Promise.resolve());

    const updateUserGroupHandler = UpdateUserGroupHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: updatedGroups.map(_ => _.displayName) as any }
    );

    console.log("RESPONSEE TEST", response);

    expect(response.kind).toEqual("IResponseSuccessJson");
    groupsToBeRemoved.forEach(groupContract =>
      expect(mockGroupUserDeleteMethod).toHaveBeenCalledWith(
        fakeApimConfig.apimResourceGroup,
        fakeApimConfig.apim,
        groupContract.name,
        fakeUserName
      )
    );
    groupsToBeAssociated.forEach(groupContract =>
      expect(mockGroupUserCreate).toHaveBeenCalledWith(
        fakeApimConfig.apimResourceGroup,
        fakeApimConfig.apim,
        groupContract.name,
        fakeUserName
      )
    );
  });
});
