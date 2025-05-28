// eslint-disable @typescript-eslint/no-explicit-any

import { ApiManagementClient } from "@azure/arm-apimanagement";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { IAzureApimConfig } from "../../utils/apim";
import {
  ArrayToAsyncIterable,
  ReadonlyArrayToAsyncIterable
} from "../../utils/testSupport";
import { GetUsersHandler } from "../handler";

const fakeFunctionsHost = "localhost";

const pageSize = 2 as NonNegativeInteger;

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

const mockedUserContract3 = {
  email: "giuseppe@example.com",
  firstName: "giuseppe",
  id: "user-contract-2",
  identities: [
    {
      id: "identity-id-2-0",
      provider: "provider-2-0"
    },
    {
      id: "identity-id-2-1",
      provider: "provider-2-1"
    }
  ],
  lastName: "Verdi",
  name: "user-name-2",
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
  note: undefined as string | undefined,
  registrationDate: new Date(),
  state: "active",
  type: "type"
};

jest.mock("@azure/arm-apimanagement");
const mockApiManagementClient = ApiManagementClient as jest.Mock;
const mockLog = jest.fn();
const mockGetToken = jest.fn();

mockGetToken.mockImplementation(() => {
  return Promise.resolve(undefined);
});

const mockedContext = { log: { error: mockLog } };

describe("GetUsers", () => {
  it("should return an internal error response if the API management client returns an error", async () => {
    mockApiManagementClient.mockImplementation(() => ({
      user: {
        listByService: (_: string, __: string, ___: string) => ({
          next: () => Promise.reject(new Error("API management client error")),
          [Symbol.asyncIterator]() {
            return this;
          }
        })
      }
    }));
    const getUsersHandler = GetUsersHandler(
      fakeApimConfig,
      fakeFunctionsHost,
      pageSize
    );

    const response = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client returns invalid data", async () => {
    // eslint-disable-next-line functional/prefer-readonly-type
    const mockedApimUsersList: any[] & { nextLink?: string } = [
      mockedUserContract1,
      mockedInvalidUserContract
    ];

    mockApiManagementClient.mockImplementation(() => ({
      user: {
        listByService: (_: string, __: string, ___: string) =>
          ArrayToAsyncIterable(mockedApimUsersList)
      }
    }));
    const getUsersHandler = GetUsersHandler(
      fakeApimConfig,
      fakeFunctionsHost,
      pageSize
    );

    const response = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the user collection with the registered users and the proper next value", async () => {
    const mockedApimUsersList: ReadonlyArray<any> = [
      mockedUserContract1,
      mockedUserContract2,
      mockedUserContract3
    ];

    const expectedItems: ReadonlyArray<any> = [
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
      } as any,
      {
        email: mockedUserContract3.email,
        first_name: mockedUserContract3.firstName,
        id: mockedUserContract3.id,
        identities: mockedUserContract3.identities,
        last_name: mockedUserContract3.lastName,
        name: mockedUserContract3.name,
        note: mockedUserContract3.note,
        registration_date: mockedUserContract3.registrationDate,
        state: mockedUserContract3.state,
        type: mockedUserContract3.type
      } as any
    ];

    mockApiManagementClient
      .mockImplementationOnce(() => ({
        user: {
          listByService: (_: string, __: string, options: { skip: number }) =>
            ReadonlyArrayToAsyncIterable(mockedApimUsersList.slice(0, pageSize))
        }
      }))
      .mockImplementationOnce(() => ({
        user: {
          listByService: (_: string, __: string, options: { skip: number }) =>
            ReadonlyArrayToAsyncIterable(mockedApimUsersList.slice(pageSize))
        }
      }));

    const getUsersHandler = GetUsersHandler(
      fakeApimConfig,
      fakeFunctionsHost,
      pageSize
    );

    const responseWithNext: any = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      undefined
    );

    expect(responseWithNext).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        items: expectedItems.slice(0, pageSize),
        next: `https://${fakeFunctionsHost}/adm/users?cursor=${pageSize}`
      }
    });

    // next should be undefined
    const lastCursor = pageSize;
    const responseWithoutNext = await getUsersHandler(
      mockedContext as any,
      undefined as any,
      lastCursor
    );

    expect(responseWithoutNext).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        items: expectedItems.slice(lastCursor),
        next: undefined
      }
    });
  });
});
