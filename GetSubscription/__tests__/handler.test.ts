// eslint-disable @typescript-eslint/no-explicit-any
import {
  ApiManagementClient,
  SubscriptionContract
} from "@azure/arm-apimanagement";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as ApimUtils from "../../utils/apim";
import {
  IAzureApimConfig,
  IServicePrincipalCreds,
  parseOwnerIdFullPath
} from "../../utils/apim";
import { GetSubscriptionHandler } from "../handler";
import { SubscriptionWithoutKeys } from "../../generated/definitions/SubscriptionWithoutKeys";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { RestError } from "@azure/ms-rest-js";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

const fakeSubscriptionId = "a-non-empty-string";

const fakeSubscriptionOwnerId = "5931a75ae4bbd512a88c680b";
const fakeFullPathSubscriptionOwnerId =
  "/subscriptions/subid/resourceGroups/{resourceGroup}/providers/Microsoft.ApiManagement/service/{apimService}/users/" +
  fakeSubscriptionOwnerId;

const aValidSubscription: SubscriptionContract = {
  allowTracing: false,
  createdDate: new Date(),
  displayName: undefined,
  endDate: undefined,
  expirationDate: undefined,
  id: "12345",
  name: undefined,
  notificationDate: undefined,
  ownerId: fakeFullPathSubscriptionOwnerId,
  primaryKey: "a-primary-key",
  scope: "/apis",
  secondaryKey: "a-secondary-key",
  startDate: new Date(),
  state: "active",
  stateComment: undefined,
  type: undefined
};

const mockSubscription = jest.fn();

const mockApiManagementClient = ApiManagementClient as jest.Mock;
mockApiManagementClient.mockImplementation(() => ({
  subscription: {
    get: mockSubscription
  }
}));

const spyOnGetApiClient = jest.spyOn(ApimUtils, "getApiClient");
spyOnGetApiClient.mockImplementation(() =>
  TE.of(new mockApiManagementClient())
);

const mockLog = jest.fn();
const mockedContext = { log: { error: mockLog } };

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("GetSubscription", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error from ApiManagementClient constructor"))
    );

    const getSubscriptionHandler = GetSubscriptionHandler(fakeApimConfig);

    const response = await getSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the API management client doesn't retrieve a subscription", async () => {
    mockSubscription.mockImplementation(() =>
      Promise.reject(new RestError("not found", "Not Found", 404))
    );

    const getSubscriptionHandler = GetSubscriptionHandler(fakeApimConfig);

    const response = await getSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return subscription information", async () => {
    mockSubscription.mockImplementationOnce(() => {
      const apimResponse = aValidSubscription;
      return Promise.resolve(apimResponse);
    });

    const getSubscriptionHandler = GetSubscriptionHandler(fakeApimConfig);

    const response = await getSubscriptionHandler(
      mockedContext as any,
      undefined as any,
      fakeSubscriptionId as NonEmptyString
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        id: aValidSubscription.id,
        owner_id: parseOwnerIdFullPath(
          aValidSubscription.ownerId as NonEmptyString
        ),
        scope: aValidSubscription.scope
      }
    });
    expect(
      E.isRight(SubscriptionWithoutKeys.decode((response as any).value))
    ).toBeTruthy();
  });
});
