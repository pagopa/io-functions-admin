import { GroupContract } from "@azure/arm-apimanagement";
import { RestError } from "@azure/ms-rest-js";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as TE from "fp-ts/lib/TaskEither";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { ArrayToAsyncIterable } from "../../utils/testSupport";
import { GetImpersonateServiceHandler } from "../handler";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

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

const aValidSubscriptionId = "valid-subscription-id" as NonEmptyString;
const aNotExistingSubscriptionId = "not-existing-subscription-id" as NonEmptyString;
const aBreakingApimSubscriptionId = "broken-subscription-id" as NonEmptyString;
const aValidSubscriptionIdWithouthOwner = "no-owner-subscription-id" as NonEmptyString;

const mockedSubscription = {
  ownerId: "/users/userId"
};

const mockedSubscriptionWithoutOwner: {
  displayName: string;
  ownerId: string | undefined;
} = {
  displayName: "without-woner",
  ownerId: undefined
};

const anApimGroupContract: GroupContract = {
  description: "group description",
  displayName: "groupName"
};

const someValidGroups: Array<GroupContract> = [
  { ...anApimGroupContract, id: "group #1" },
  { ...anApimGroupContract, id: "group #2" },
  { ...anApimGroupContract, id: "group #3" },
  { ...anApimGroupContract, id: "group #4" }
];

const mockedUserWithoutEmail = {
  name: "test",
  surname: "test"
};

const mockUserGroupList = jest
  .fn()
  .mockImplementation(() => ArrayToAsyncIterable(someValidGroups));

const mockUserSubscriptionGet = jest
  .fn()
  .mockImplementation(() => Promise.resolve(mockedSubscription));
const mockUserGet = jest
  .fn()
  .mockImplementation(() => Promise.resolve({ email: "user_email@mail.it" }));

const mockApiManagementClient = {
  userGroup: {
    list: mockUserGroupList
  },
  subscription: {
    get: mockUserSubscriptionGet
  },
  user: {
    get: mockUserGet
  }
} as any;

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() => TE.of(mockApiManagementClient));

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("GetImpersonateServiceHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("GIVEN a not working APIM client WHEN call the handler THEN an Internel Error is returned", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error from ApiManagementClient constructor"))
    );

    const getImpersonateServiceHandler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await getImpersonateServiceHandler(
      mockedContext as any,
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("GIVEN a not working APIM server WHEN call the handler THEN an Internal Error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.reject(new RestError("generic error", "", 500))
    );
    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aBreakingApimSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("GIVEN a subscription without owner WHEN call the handler THEN a Not Found Error error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.resolve(mockedSubscriptionWithoutOwner)
    );

    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aValidSubscriptionIdWithouthOwner
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("GIVEN a subscription with not existing owner WHEN call the handler THEN a Not Found Error error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.resolve(mockedSubscription)
    );

    mockUserGet.mockImplementationOnce(() =>
      Promise.reject(new RestError("not found", "Not Found", 404))
    );

    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aValidSubscriptionIdWithouthOwner
    );

    console.log("RESPONSE IS", response);

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("GIVEN a user without email WHEN call the handler THEN a Not Found error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.resolve(mockedUserWithoutEmail)
    );

    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aNotExistingSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("GIVEN an error while retrieving user WHEN call the handler THEN an Internal Error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.reject(new RestError("Internal Error", "Internal Error", 500))
    );

    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aNotExistingSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });
  it("GIVEN a not existing subscription id WHEN call the handler THEN a Not Found error is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );
    mockUserSubscriptionGet.mockImplementationOnce(() =>
      Promise.reject(new RestError("not found", "Not Found", 404))
    );

    const response = await handler(
      mockedContext as any,
      undefined as any, // Not used
      aNotExistingSubscriptionId
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("GIVEN an existing subscription id WHEN call the handler THEN a proper Impersonated Service is returned", async () => {
    const handler = GetImpersonateServiceHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await handler(
      mockedContext as any,
      undefined as any,
      aValidSubscriptionId as any
    );

    expect(response).toEqual(
      expect.objectContaining({
        kind: "IResponseSuccessJson",
        value: {
          service_id: "valid-subscription-id",
          user_groups: "groupName,groupName,groupName,groupName",
          user_email: "user_email@mail.it"
        }
      })
    );
  });
});
