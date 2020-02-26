// tslint:disable:no-any

import { ApiManagementClient } from "@azure/arm-apimanagement";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { User } from "../../generated/definitions/User";
import { IAzureApimConfig, IServicePrincipalCreds } from "../handler";
import { GetUsersHandler } from "../handler";

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

const mockedUserContract1 = {
  email: "mario@example.com",
  firstName: "Mario",
  id: "user-contract-0",
  identities: [
    {
      id: "identity-id-0-0",
      provider: "provider-0-0"
    },
    {
      id: "identity-id-0-1",
      provider: "provider-0-1"
    }
  ],
  lastName: "Rossi",
  name: "user-name-0",
  note: "note",
  registrationDate: new Date(),
  state: "active",
  type: "type"
};
const mockedUserContract2 = {
  email: "luigi@example.com",
  firstName: "Luigi",
  id: "user-contract-1",
  identities: [
    {
      id: "identity-id-1-0",
      provider: "provider-1-0"
    },
    {
      id: "identity-id-1-1",
      provider: "provider-1-1"
    }
  ],
  lastName: "Rossi",
  name: "user-name-1",
  note: "note",
  registrationDate: new Date(),
  state: "active",
  type: "type"
};
const mockedInvalidUserContract = {
  email: "luigi@example.com",
  firstName: "Luigi",
  id: "user-contract-1",
  identities: [
    {
      id: 123,
      provider: "provider-1-0"
    },
    {
      id: "identity-id-1-1",
      provider: "provider-1-1"
    }
  ],
  lastName: "Rossi",
  name: "user-name-1",
  note: null,
  registrationDate: new Date(),
  state: "active",
  type: "type"
};

const mockLoginWithServicePrincipalSecret = jest.spyOn(
  msRestNodeAuth,
  "loginWithServicePrincipalSecret"
);

jest.mock("@azure/arm-apimanagement");
const mockApiManagementClient = ApiManagementClient as jest.Mock;
const mockLog = jest.fn();
const mockGetToken = jest.fn();

mockLoginWithServicePrincipalSecret.mockImplementation(() => {
  return Promise.resolve({ getToken: mockGetToken });
});
mockGetToken.mockImplementation(() => {
  return Promise.resolve(undefined);
});

const mockedContext = { log: { error: mockLog } };

describe("GetUsers", () => {
  it("should return an internal error response if the API management client returns an error", async () => {
    mockApiManagementClient.mockImplementation(() => ({
      user: {
        listByService: (_, __, ___) =>
          Promise.reject(new Error("API management client error"))
      }
    }));
    const getUsersHandler = GetUsersHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client returns invalid data", async () => {
    // tslint:disable-next-line:readonly-array
    const mockedApimUsersList: any[] = [
      mockedUserContract1,
      mockedUserContract2,
      mockedInvalidUserContract
    ];
    // tslint:disable-next-line:no-string-literal
    mockedApimUsersList["nextLink"] = "next-link";
    mockApiManagementClient.mockImplementation(() => ({
      user: {
        listByService: (_, __, ___) => Promise.resolve(mockedApimUsersList)
      }
    }));
    const getUsersHandler = GetUsersHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the user collection with the registered users and the proper has_next value", async () => {
    // tslint:disable-next-line:readonly-array
    const mockedApimUsersList: any[] = [
      mockedUserContract1,
      mockedUserContract2
    ];

    // tslint:disable-next-line:no-let
    let mockedNextLinkValue: string | undefined;

    mockApiManagementClient.mockImplementation(() => ({
      user: {
        listByService: (_, __, ___) => {
          // tslint:disable-next-line:no-string-literal
          mockedApimUsersList["nextLink"] = mockedNextLinkValue;
          return Promise.resolve(mockedApimUsersList);
        }
      }
    }));

    const expectedItems: ReadonlyArray<User> = [
      {
        email: mockedUserContract1.email,
        first_name: mockedUserContract1.firstName,
        id: mockedUserContract1.id,
        identities: mockedUserContract1.identities,
        last_name: mockedUserContract1.lastName,
        name: mockedUserContract1.name,
        note: mockedUserContract1.note,
        registration_date: mockedUserContract1.registrationDate,
        state: mockedUserContract1.state,
        type: mockedUserContract1.type
      } as any,
      {
        email: mockedUserContract2.email,
        first_name: mockedUserContract2.firstName,
        id: mockedUserContract2.id,
        identities: mockedUserContract2.identities,
        last_name: mockedUserContract2.lastName,
        name: mockedUserContract2.name,
        note: mockedUserContract2.note,
        registration_date: mockedUserContract2.registrationDate,
        state: mockedUserContract2.state,
        type: mockedUserContract2.type
      } as any
    ];

    const getUsersHandler = GetUsersHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    // has_next should be true
    mockedNextLinkValue = "next-link";

    const responseWithNext = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined
    );

    expect(responseWithNext).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        has_next: true,
        items: expectedItems
      }
    });

    // has_next should be false
    mockedNextLinkValue = undefined;

    const responseWithoutNext = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any,
      undefined
    );

    expect(responseWithoutNext).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        has_next: false,
        items: expectedItems
      }
    });
  });
});
