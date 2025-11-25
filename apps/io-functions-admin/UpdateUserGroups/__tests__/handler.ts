// eslint-disable @typescript-eslint/no-explicit-any

import { ApiManagementClient, GroupContract } from "@azure/arm-apimanagement";
import { UserGroup } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { right } from "fp-ts/lib/Either";
import { fromEither, left } from "fp-ts/lib/TaskEither";
import { assert, beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { EmailAddress } from "../../generated/definitions/EmailAddress";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig } from "../../utils/apim";
import {
  ArrayToAsyncIterable,
  ReadonlyArrayToAsyncIterable
} from "../../utils/testSupport";
import { UpdateUserGroupHandler } from "../handler";

vi.mock("@azure/arm-apimanagement");

const fakeExistingGroups: readonly GroupContract[] = [
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

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

const fakeUserName = "a-non-empty-string";
const fakeUserEmail = "user@example.com" as EmailAddress;

const mockGroupListByService = vi.fn();
const mockGroupListByServiceNext = vi.fn();
const mockGroupUserCreate = vi.fn();
const mockGroupUserDeleteMethod = vi.fn();
const mockUserListByService = vi.fn();
const mockUserGroupList = vi.fn();
const mockUserGroupListNext = vi.fn();

const mockApiManagementClient = ApiManagementClient as Mock;
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

const spyOnGetApiClient = vi.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  fromEither(right(new mockApiManagementClient()))
);

const mockLog = vi.fn();
const mockedContext = { log: { error: mockLog } };

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("UpdateUserGroups", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      left(Error("Error from ApiManagementClient constructor"))
    );

    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the users", async () => {
    mockUserListByService.mockImplementation(() => ({
      next: () => Promise.reject(new Error("Error on users list")),
      [Symbol.asyncIterator]() {
        return this;
      }
    }));

    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: fakeExistingGroups.map(_ => _.displayName) as any }
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no user", async () => {
    mockUserListByService.mockImplementation(() => ArrayToAsyncIterable([]));
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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
    mockUserListByService.mockImplementation(() => ({
      next: () => Promise.reject(new Error("Error on user list by service")),
      [Symbol.asyncIterator]() {
        return this;
      }
    }));
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    mockGroupListByService.mockImplementation(() => ({
      next: () => Promise.reject(new Error("Error on user groups list")),
      [Symbol.asyncIterator]() {
        return this;
      }
    }));

    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      {
        groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any
      }
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
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      {
        groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any
      }
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
      .mockImplementationOnce(() => ({
        next: () => Promise.reject(new Error("Error on user groups list")),
        [Symbol.asyncIterator]() {
          return this;
        }
      }));

    mockGroupListByService.mockImplementation(() =>
      ReadonlyArrayToAsyncIterable(fakeExistingGroups)
    );
    mockGroupUserCreate.mockImplementation(() => Promise.resolve());
    mockGroupUserDeleteMethod.mockImplementation(() => Promise.resolve());
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      {
        groups: fakeExistingGroups.slice(1, 4).map(_ => _.displayName) as any
      }
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
    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

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

    const updateUserGroupHandler = UpdateUserGroupHandler(fakeApimConfig);

    const response = await updateUserGroupHandler(
      mockedContext as any,
      undefined as any,
      fakeUserEmail,
      { groups: updatedGroups.map(_ => _.displayName) as any }
    );
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
