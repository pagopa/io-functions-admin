// tslint:disable:no-any

import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { UserCreated } from "../../generated/definitions/UserCreated";
import { UserPayload } from "../../generated/definitions/UserPayload";
import { UserStateEnum } from "../../generated/definitions/UserState";
import { IServicePrincipalCreds } from "../../utils/apim";
import { UpdateUserHandler } from "../handler";

const aTokenName = "ATokenName" as NonEmptyString;
const fakeServicePrincipalCredentials: IServicePrincipalCreds = {
  clientId: "client-id",
  secret: "secret",
  tenantId: "tenant-id"
};

const fakeRequestPayload = {
  email: "user@example.com",
  first_name: "first-name",
  last_name: "family-name",
  token_name: aTokenName
} as UserPayload;

const fakeObjectId = "ADB2C-user";

const mockLoginWithServicePrincipalSecret = jest.spyOn(
  msRestNodeAuth,
  "loginWithServicePrincipalSecret"
);

jest.mock("@azure/graph");
jest.mock("@azure/arm-apimanagement");
const mockGraphRbacManagementClient = GraphRbacManagementClient as jest.Mock;
const mockLog = jest.fn();
const mockGetToken = jest.fn();

mockLoginWithServicePrincipalSecret.mockImplementation(() => {
  return Promise.resolve({ getToken: mockGetToken });
});
mockGetToken.mockImplementation(() => {
  return Promise.resolve(undefined);
});
const mockUsersCreate = jest.fn();

mockGraphRbacManagementClient.mockImplementation(() => ({
  users: {
    list: jest.fn(() =>
      Promise.resolve([
        {
          email: "user@example.com"
        }
      ])
    ),
    update: mockUsersCreate
  }
}));

const fakeAdb2cExtensionAppClientId = "extension-client-id" as NonEmptyString;

const mockedContext = { log: { error: mockLog } };

describe("UpdateUser", () => {
  it("should return an internal error response if the ADB2C client can not be got", async () => {
    mockLoginWithServicePrincipalSecret.mockImplementationOnce(() =>
      Promise.reject("Error from ApiManagementClient constructor")
    );

    const updateUserHandler = UpdateUserHandler(
      fakeServicePrincipalCredentials,
      fakeAdb2cExtensionAppClientId
    );

    const response = await updateUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the ADB2C client can not update the user", async () => {
    mockUsersCreate.mockImplementationOnce(() =>
      Promise.reject("Users update error")
    );

    const updateUserHandler = UpdateUserHandler(
      fakeServicePrincipalCredentials,
      fakeAdb2cExtensionAppClientId
    );

    const response = await updateUserHandler(
      mockedContext as any,
      undefined as any,
      fakeRequestPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the user updated", async () => {
    const fakeApimUser = {
      email: fakeRequestPayload.email,
      firstName: fakeRequestPayload.first_name,
      id: "user-id",
      identities: [
        {
          id: fakeObjectId,
          provider: "AadB2C"
        }
      ],
      lastName: fakeRequestPayload.last_name,
      name: fakeObjectId,
      registrationDate: new Date(),
      state: UserStateEnum.active,
      type: "Microsoft.ApiManagement/service/users"
    };
    const expectedUpdatedUser: UserCreated = {
      email: fakeApimUser.email,
      first_name: fakeApimUser.firstName,
      id: fakeApimUser.name,
      last_name: fakeApimUser.lastName,
      token_name: aTokenName
    };
    mockUsersCreate.mockImplementationOnce(() =>
      Promise.resolve({ objectId: fakeObjectId })
    );

    const updateUserHandler = UpdateUserHandler(
      fakeServicePrincipalCredentials,
      fakeAdb2cExtensionAppClientId
    );

    const response = await updateUserHandler(
      mockedContext as any,
      undefined as any,
      fakeRequestPayload
    );
    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: expectedUpdatedUser
    });
  });
});
