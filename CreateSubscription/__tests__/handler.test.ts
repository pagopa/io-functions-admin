// tslint:disable:no-any

import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  ProductContract,
  SubscriptionContract,
  UserContract
} from "@azure/arm-apimanagement/esm/models";
import { isRight, left, right } from "fp-ts/lib/Either";
import { fromEither } from "fp-ts/lib/TaskEither";
import { ProductNamePayload } from "../../generated/definitions/ProductNamePayload";
import { UserInfo } from "../../generated/definitions/UserInfo";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig, IServicePrincipalCreds } from "../../utils/apim";
import { subscriptionContractToApiSubscription } from "../../utils/conversions";
import { CreateSubscriptionHandler } from "../handler";

jest.mock("@azure/arm-apimanagement");

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

// tslint:disable-next-line:readonly-array
const fakeParams = ["user@example.com", "newSubscriptionId"];
const fakePayload = {
  product_name: "another-non-empty-string"
} as ProductNamePayload;

const fakeUserId = "a-non-empty-string";

const [userEmail, productId] = fakeParams;
const aFakeApimUser: UserContract = {
  email: userEmail,
  id: fakeUserId
};
const aFakeApimProductContract: ProductContract = {
  displayName: "product name",
  id: productId,
  name: "groupName"
};
const aFakeApimSubscriptionContract: SubscriptionContract = {
  allowTracing: false,
  createdDate: new Date(),
  displayName: null,
  endDate: undefined,
  expirationDate: undefined,
  id: "subscription-id",
  name: undefined,
  notificationDate: undefined,
  ownerId: aFakeApimUser.id,
  primaryKey: "a-primary-key",
  scope: `/products/${aFakeApimProductContract.id}`,
  secondaryKey: "a-secondary-key",
  startDate: new Date(),
  state: "active",
  stateComment: undefined,
  type: undefined
};

const mockUserListByService = jest.fn();
const mockProductList = jest.fn();
const mockSubscriptionCreateOrUpdate = jest.fn();

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  product: {
    listByService: mockProductList
  },
  subscription: {
    createOrUpdate: mockSubscriptionCreateOrUpdate
  },
  user: {
    listByService: mockUserListByService
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  fromEither(right(new mockApiManagementClient()))
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// tslint:disable-next-line:no-big-function
describe("CreateSubscription", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      fromEither(left(Error("Error from ApiManagementClient constructor")))
    );

    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the users", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.reject("Error on users list")
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no user", async () => {
    mockUserListByService.mockImplementation(() => Promise.resolve([]));
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return an internal error response if the API management client list a user without a valid id", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: "" }])
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not list the products", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: fakeUserId }])
    );
    mockProductList.mockImplementation(() =>
      Promise.reject(Error("Error on product list"))
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client returns no product", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: fakeUserId }])
    );
    mockProductList.mockImplementation(() => Promise.resolve([]));

    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return an internal error response if the API management client list a product without a valid id", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: fakeUserId }])
    );
    mockProductList.mockImplementation(() =>
      Promise.resolve([{ displayName: fakePayload.product_name }])
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client can not create the subscriiption", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: fakeUserId }])
    );
    mockProductList.mockImplementation(() =>
      Promise.resolve([aFakeApimProductContract])
    );
    mockSubscriptionCreateOrUpdate.mockImplementation(() =>
      Promise.reject(Error("Error on subscription create or update"))
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return an internal error response if the API management client lists invalid subscriptions", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([{ id: fakeUserId }])
    );
    mockProductList.mockImplementation(() =>
      Promise.resolve([{ displayName: "product name", id: "product-id" }])
    );
    mockSubscriptionCreateOrUpdate.mockImplementation(() =>
      Promise.resolve([{ groupContractType: "invalid" }])
    );
    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return the subscription created", async () => {
    mockUserListByService.mockImplementation(() =>
      Promise.resolve([aFakeApimUser])
    );
    mockProductList.mockImplementation(() =>
      Promise.resolve([aFakeApimProductContract])
    );
    mockSubscriptionCreateOrUpdate.mockImplementation(() =>
      Promise.resolve(aFakeApimSubscriptionContract)
    );

    const createSubscriptionHandler = CreateSubscriptionHandler(
      fakeServicePrincipalCredentials,
      fakeApimConfig
    );

    const response = await createSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeParams as any,
      fakePayload as any
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: subscriptionContractToApiSubscription(
        aFakeApimSubscriptionContract
      ).value
    });
    expect(isRight(UserInfo.decode((response as any).value))).toBeTruthy();
  });
});
