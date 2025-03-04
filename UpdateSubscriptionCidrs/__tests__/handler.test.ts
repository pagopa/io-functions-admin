// eslint-disable @typescript-eslint/no-explicit-any
import {
  ApiManagementClient,
  SubscriptionContract
} from "@azure/arm-apimanagement";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as ApimUtils from "../../utils/apim";
import { IAzureApimConfig } from "../../utils/apim";
import { UpdateSubscriptionCidrsHandler } from "../handler";
import { CIDR } from "@pagopa/ts-commons/lib/strings";
import { none } from "fp-ts/lib/Option";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { SubscriptionCIDRs } from "../../generated/definitions/SubscriptionCIDRs";

jest.mock("@azure/arm-apimanagement");
jest.mock("@azure/graph");

const fakeApimConfig: IAzureApimConfig = {
  apim: "apim",
  apimResourceGroup: "resource group",
  subscriptionId: "subscription id"
};

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

const aCIDRsPayload = [("1.2.3.4/5" as any) as CIDR] as any;

const aSubscriptionCidrs = {
  cidrs: (["1.2.3.4/5"] as unknown) as CIDR[],
  id: "aSubscriptionId"
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
describe("UpdateSubscriptionCidrs", () => {
  it("should return an internal error response if the API management client can not be got", async () => {
    spyOnGetApiClient.mockImplementationOnce(() =>
      TE.left(Error("Error on APIM client creation"))
    );
    const mockSubscriptionCIDRsModel = {
      upsert: jest.fn(() => {
        return TE.right(none);
      })
    };

    const updateSubscriptionCidrs = UpdateSubscriptionCidrsHandler(
      fakeApimConfig,
      (mockSubscriptionCIDRsModel as any) as SubscriptionCIDRsModel
    );

    const response = await updateSubscriptionCidrs(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorInternal");
    expect(mockSubscriptionCIDRsModel.upsert).not.toBeCalled();
  });

  it("should return a not found error response if the apiclient get subscription returns an error", async () => {
    mockApiManagementClient.mockImplementation(() => ({
      subscription: {
        get: jest.fn(() => {
          return Promise.reject(new Error("error"));
        })
      }
    }));

    const mockSubscriptionCIDRsModel = {
      upsert: jest.fn(() => {
        return TE.right(none);
      })
    };

    const updateSubscriptionCidrs = UpdateSubscriptionCidrsHandler(
      fakeApimConfig,
      (mockSubscriptionCIDRsModel as any) as SubscriptionCIDRsModel
    );

    const response = await updateSubscriptionCidrs(
      mockedContext as any,
      undefined as any,
      undefined as any,
      undefined as any
    );

    expect(response.kind).toEqual("IResponseErrorNotFound");
    expect(mockSubscriptionCIDRsModel.upsert).not.toBeCalled();
  });

  it("should return an error query response if cosmos returns an error", async () => {
    mockApiManagementClient.mockImplementation(() => ({
      subscription: {
        get: jest.fn(() =>
          Promise.resolve({
            ...((aValidSubscription as any) as SubscriptionContract)
          })
        )
      }
    }));

    const mockSubscriptionCIDRsModel = {
      upsert: jest.fn(() => {
        return TE.left(toCosmosErrorResponse("db error") as CosmosErrors);
      })
    };

    const updateSubscriptionCidrs = UpdateSubscriptionCidrsHandler(
      fakeApimConfig,
      (mockSubscriptionCIDRsModel as any) as SubscriptionCIDRsModel
    );

    const response = await updateSubscriptionCidrs(
      mockedContext as any,
      undefined as any,
      undefined as any,
      aCIDRsPayload
    );

    expect(response.kind).toEqual("IResponseErrorQuery");
    expect(mockSubscriptionCIDRsModel.upsert).toBeCalledTimes(1);
  });

  it("should return an updated CIDRsPayload", async () => {
    mockApiManagementClient.mockImplementation(() => ({
      subscription: {
        get: jest.fn(() =>
          Promise.resolve({
            ...((aValidSubscription as any) as SubscriptionContract)
          })
        )
      }
    }));

    const mockSubscriptionCIDRsModel = {
      upsert: jest.fn(() => {
        return TE.right({
          cidrs: (["1.2.3.4/5"] as unknown) as CIDR[],
          subscriptionId: "aSubscriptionId"
        });
      })
    };

    const updateSubscriptionCidrs = UpdateSubscriptionCidrsHandler(
      fakeApimConfig,
      (mockSubscriptionCIDRsModel as any) as SubscriptionCIDRsModel
    );

    const response = await updateSubscriptionCidrs(
      mockedContext as any,
      undefined as any,
      undefined as any,
      aCIDRsPayload
    );

    expect(mockSubscriptionCIDRsModel.upsert).toBeCalledTimes(1);
    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: aSubscriptionCidrs
    });
    expect(
      E.isRight(SubscriptionCIDRs.decode((response as any).value))
    ).toBeTruthy();
  });
});
