import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  SubscriptionGetResponse,
  UserContract
} from "@azure/arm-apimanagement/esm/models";
import { RestError } from "@azure/ms-rest-js";

import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";

import { UpdateSubscriptionOwnerPayload } from "../../generated/definitions/UpdateSubscriptionOwnerPayload";

import * as ApimUtils from "../../utils/apim";
import { UpdateSubscriptionOwnerHandler } from "../handler";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { query } from "express";

const fakeServicePrincipalCredentials: ApimUtils.IServicePrincipalCreds = {
  clientId: "client-id",
  secret: "secret",
  tenantId: "tenant-id"
};

const fakeApimConfig: ApimUtils.IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

const ownerFakeUserId = "anUserId" as NonEmptyString;
const ownerUserEmail = "a-fake-email@fake.it" as NonEmptyString;
const fakeOwner: UserContract = {
  email: ownerUserEmail,
  id: ownerFakeUserId
};

const newOwnerFakeUserId = "anotherUserId" as NonEmptyString;
const newOwnerFakeUserEmail = "another-fake-email@fake.it" as NonEmptyString;
const fakeNewOwner: UserContract = {
  email: newOwnerFakeUserEmail,
  id: newOwnerFakeUserId
};

// SubscriptionGetResponse
// SubscriptionCreateOrUpdateResponse
const fakeSubscription = {
  id: "fakeSubscriptionId" as NonEmptyString,
  primaryKey: "primary-key" as NonEmptyString,
  secondaryKey: "secondary-key" as NonEmptyString,
  name: "FakeSubscription" as NonEmptyString,
  ownerId: ownerFakeUserId
};
const anotherFakeSubscription = {
  id: "anotherFakeSubscriptionId" as NonEmptyString,
  primaryKey: "primary-key" as NonEmptyString,
  secondaryKey: "secondary-key" as NonEmptyString,
  name: "AnotherFakeSubscription" as NonEmptyString,
  ownerId: ownerFakeUserId
};

const fakeSubscriptionsList = [fakeSubscription, anotherFakeSubscription];

const aValidPayload: UpdateSubscriptionOwnerPayload = pipe(
  {
    current_email: ownerUserEmail,
    destination_email: newOwnerFakeUserEmail,
    subscription_ids: [fakeSubscription.id]
  },
  UpdateSubscriptionOwnerPayload.decode,
  E.getOrElseW(() => {
    throw Error();
  })
);

const mockUserListByService = jest.fn(
  async (_, __, _query: { filter: string }) => {
    const email = _query.filter.split("'")[1];

    const p = [fakeOwner, fakeNewOwner].filter(o => o.email === email);
    return p;
  }
);
const mockSubcriptionGet = jest.fn(async (_, __, subscriptionId) => {
  const res = fakeSubscriptionsList.filter(s => s.id === subscriptionId);
  if (res.length === 0)
    throw new RestError(`Subscription id ${subscriptionId} not found`, "", 404);
  return res[0];
});
const mockSubscriptionCreateOrUpdate = jest.fn(
  async (_, __, subscriptionId) => {
    const res = fakeSubscriptionsList.filter(s => s.id === subscriptionId);
    if (res.length === 0)
      throw new RestError(
        `Subscription id ${subscriptionId} not found`,
        "",
        404
      );
    return res[0];
  }
);

jest.mock("@azure/arm-apimanagement");
const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  subscription: {
    createOrUpdate: mockSubscriptionCreateOrUpdate,
    get: mockSubcriptionGet
  },
  user: {
    listByService: mockUserListByService
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  TE.of(new mockApiManagementClient())
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

describe("UpdateSubscriptionOwner#Client Errors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error from ApiManagementClient constructor"))
    );

    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      aValidPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
    expect(response.detail).toEqual(
      "Internal server error: Error from ApiManagementClient constructor"
    );
  });
});

describe("UpdateSubscriptionOwner - getUsers Errors", () => {
  it("should return an error if at lest one user does not exists", async () => {
    mockUserListByService.mockImplementationOnce(async (_, __, _query) => []);

    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      aValidPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
    expect(response.detail).toEqual(
      "Internal server error: Cannot find user by email"
    );
  });

  it("should return an error if at least one APIM user request fails", async () => {
    mockUserListByService.mockImplementationOnce(async () => {
      throw "Error on users list";
    });

    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      aValidPayload
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
    expect(response.detail).toEqual(
      "Internal server error: Error on users list"
    );
  });
});

describe("UpdateSubscriptionOwner - getSubscriptions Errors", () => {
  it.each`
    statusCode | error
    ${500}     | ${"Internal error"}
    ${404}     | ${"Not found error"}
  `(
    "should return an object containing errors, if API management client fail retrieving subscriptions with status code $statusCode",
    async ({ statusCode, error }) => {
      mockSubcriptionGet.mockImplementationOnce(async () => {
        throw new RestError(error, "", statusCode);
      });

      const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
        fakeServicePrincipalCredentials,
        fakeApimConfig
      );

      const response = await createSubscriptionHandler(
        mockedContext as any,
        undefined as any,
        aValidPayload
      );

      expect(response.kind).toEqual("IResponseSuccessJson");

      if (response.kind === "IResponseSuccessJson") {
        expect(response.value).toEqual({
          errors: expect.arrayContaining([
            `ERROR|${error} SubscriptionId = ${aValidPayload.subscription_ids[0]}`
          ]),
          results: []
        });
      }
    }
  );

  it("should return an object containing errors, if ownerId does not correspond", async () => {
    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      {
        ...aValidPayload,
        current_email: newOwnerFakeUserEmail
      }
    );

    expect(response.kind).toEqual("IResponseSuccessJson");

    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        errors: expect.arrayContaining([
          `ERROR|Subscription ${fakeSubscription.name} is not owned by ${newOwnerFakeUserEmail}`
        ]),
        results: []
      });
    }
  });

  it("should return an object containing both error and result, if at least one subscription update fails", async () => {
    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const nonExistingId = "a-non-existing-subscription-id" as NonEmptyString;
    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      {
        ...aValidPayload,
        subscription_ids: [fakeSubscription.id, nonExistingId]
      }
    );

    expect(response.kind).toEqual("IResponseSuccessJson");

    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        results: expect.arrayContaining([
          `Update subscription ${fakeSubscription.name} with owner ${newOwnerFakeUserId} [${newOwnerFakeUserEmail}]`
        ]),
        errors: expect.arrayContaining([
          `ERROR|Subscription id ${nonExistingId} not found SubscriptionId = ${nonExistingId}`
        ])
      });
    }
  });
});

describe("UpdateSubscriptionOwner - happy path", () => {
  it("should return an object containing results, if everything it's ok", async () => {
    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      aValidPayload
    );

    expect(response.kind).toEqual("IResponseSuccessJson");

    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        results: expect.arrayContaining([
          `Update subscription ${fakeSubscription.name} with owner ${newOwnerFakeUserId} [${newOwnerFakeUserEmail}]`
        ]),
        errors: []
      });
    }
  });

  it("should return an object containing more results, if everything it's ok", async () => {
    const createSubscriptionHandler = UpdateSubscriptionOwnerHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      {
        ...aValidPayload,
        subscription_ids: [fakeSubscription.id, anotherFakeSubscription.id]
      }
    );

    expect(response.kind).toEqual("IResponseSuccessJson");

    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        results: expect.arrayContaining([
          `Update subscription ${fakeSubscription.name} with owner ${newOwnerFakeUserId} [${newOwnerFakeUserEmail}]`,
          `Update subscription ${anotherFakeSubscription.name} with owner ${newOwnerFakeUserId} [${newOwnerFakeUserEmail}]`
        ]),
        errors: []
      });
    }
  });
});
