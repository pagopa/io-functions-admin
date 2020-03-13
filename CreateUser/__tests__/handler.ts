// tslint:disable:no-any

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { left } from "fp-ts/lib/Either";
import { fromEither } from "fp-ts/lib/TaskEither";
import { User } from "../../generated/definitions/User";
import { UserPayload } from "../../generated/definitions/UserPayload";
import { UserStateEnum } from "../../generated/definitions/UserState";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import * as ApimUtils from "../../utils/apim";
import { CreateUserHandler } from "../handler";

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

const fakeRequestPayload = {
  email: "user@example.com",
  first_name: "first-name",
  last_name: "family-name"
} as UserPayload;

const fakeObjectId = "ADB2C-user";

const mockLoginWithServicePrincipalSecret = jest.spyOn(
  msRestNodeAuth,
  "loginWithServicePrincipalSecret"
);

jest.mock("@azure/graph");
jest.mock("@azure/arm-apimanagement");
const mockGraphRbacManagementClient = GraphRbacManagementClient as jest.Mock;
const mockApiManagementClient = ApiManagementClient as jest.Mock;
const mockLog = jest.fn();
const mockGetToken = jest.fn();

mockLoginWithServicePrincipalSecret.mockImplementation(() => {
  return Promise.resolve({ getToken: mockGetToken });
});
mockGetToken.mockImplementation(() => {
  return Promise.resolve(undefined);
});
const mockUsersCreate = jest.fn();
const mockUserCreateOrUpdate = jest.fn();

mockGraphRbacManagementClient.mockImplementation(() => ({
  users: {
    create: mockUsersCreate
  }
}));
mockApiManagementClient.mockImplementation(() => ({
  user: {
    createOrUpdate: mockUserCreateOrUpdate
  }
}));

const mockedContext = { log: { error: mockLog } };
describe("CreateUser", () => {
  it("should return an internal error response if the ADB2C client can not be got", async () => {
    mockLoginWithServicePrincipalSecret.mockImplementationOnce(() =>
      Promise.reject("Error from ApiManagementClient constructor")
    );

    const createUserHandler = CreateUserHandler(
      fakeServicePrincipalCredentials,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the ADB2C client can not create the user", async () => {
    mockUsersCreate.mockImplementationOnce(() =>
      Promise.reject("Users create error")
    );

    const createUserHandler = CreateUserHandler(
      fakeServicePrincipalCredentials,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      fakeRequestPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not be got", async () => {
    const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
    spyOnGetApiClient.mockImplementationOnce(() =>
      fromEither(left(Error("Error on APIM client creation")))
    );

    mockUsersCreate.mockImplementationOnce(() =>
      Promise.resolve({ objectId: fakeObjectId })
    );

    const createUserHandler = CreateUserHandler(
      fakeServicePrincipalCredentials,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      fakeRequestPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not create the user", async () => {
    mockUsersCreate.mockImplementationOnce(() =>
      Promise.resolve({ objectId: fakeObjectId })
    );
    mockUserCreateOrUpdate.mockImplementationOnce(() =>
      Promise.reject(Error("User create or update error"))
    );

    const createUserHandler = CreateUserHandler(
      fakeServicePrincipalCredentials,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      fakeRequestPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the user created", async () => {
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
    const expectedCreatedUser: User = {
      email: fakeApimUser.email,
      first_name: fakeApimUser.firstName,
      id: fakeApimUser.id,
      identities: fakeApimUser.identities,
      last_name: fakeApimUser.lastName,
      name: fakeObjectId,
      registration_date: fakeApimUser.registrationDate,
      state: fakeApimUser.state,
      type: fakeApimUser.type
    };
    mockUsersCreate.mockImplementationOnce(() =>
      Promise.resolve({ objectId: fakeObjectId })
    );
    mockUserCreateOrUpdate.mockImplementationOnce(() =>
      Promise.resolve(fakeApimUser)
    );

    const createUserHandler = CreateUserHandler(
      fakeServicePrincipalCredentials,
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createUserHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      fakeRequestPayload
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: expectedCreatedUser
    });
  });
});
