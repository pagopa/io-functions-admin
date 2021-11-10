import { ApiManagementClient } from "@azure/arm-apimanagement";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import { UpdateSubscriptionOwnerPayload } from "../../generated/definitions/UpdateSubscriptionOwnerPayload";

import * as ApimUtils from "../../utils/apim";

import { UpdateSubscriptionOwnerHandler } from "../handler";
import { UserContract } from "@azure/arm-apimanagement/esm/models";

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

const fakeUserId = "a-non-empty-string";
const userEmail = "user@example.com";
const aFakeApimUser: UserContract = {
  email: userEmail,
  id: fakeUserId
};

const aValidPayload: UpdateSubscriptionOwnerPayload = pipe(
  {
    current_email: "a-fake-email@fake.it",
    destination_email: "another-fake-email@fake.it",
    subscription_ids: ["anID", "aSecondID"]
  },
  UpdateSubscriptionOwnerPayload.decode,
  E.getOrElseW(() => {
    throw Error();
  })
);

const mockUserListByService = jest.fn(_ => Promise.resolve([aFakeApimUser]));
const mockSubcriptionGet = jest.fn();
const mockSubscriptionCreateOrUpdate = jest.fn();

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

describe("UpdateSubscriptionOwner", () => {
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
