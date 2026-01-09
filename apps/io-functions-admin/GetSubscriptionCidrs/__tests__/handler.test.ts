/* eslint-disable @typescript-eslint/no-explicit-any */
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { describe, expect, it, vi } from "vitest";

import { SubscriptionCIDRs } from "../../generated/definitions/SubscriptionCIDRs";
import { GetSubscriptionCidrsHandler } from "../handler";

const fakeSubscriptionId = "a-non-empty-string";

const mockLog = vi.fn();
const mockedContext = { log: { error: mockLog } };

describe("GetSubscriptionCidrs", () => {
  it("should return an internal server error response if the Subscription CIDRs model return a CosmosError", async () => {
    const mockSubscriptionCIDRsModel = {
      findLastVersionByModelId: vi.fn(() =>
        TE.left(toCosmosErrorResponse("db error") as CosmosErrors)
      )
    };

    const getSubscriptionCidrsHandler = GetSubscriptionCidrsHandler(
      mockSubscriptionCIDRsModel as unknown as SubscriptionCIDRsModel
    );

    const response = await getSubscriptionCidrsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(mockSubscriptionCIDRsModel.findLastVersionByModelId).toBeCalledTimes(
      1
    );
    expect(response.kind).toEqual("IResponseErrorInternal");
  });

  it("should return a not found error response if the Subscription CIDRs model return a None", async () => {
    const mockSubscriptionCIDRsModel = {
      findLastVersionByModelId: vi.fn(() => TE.of(O.none))
    };

    const getSubscriptionCidrsHandler = GetSubscriptionCidrsHandler(
      mockSubscriptionCIDRsModel as unknown as SubscriptionCIDRsModel
    );

    const response = await getSubscriptionCidrsHandler(
      mockedContext as any,
      undefined as any,
      undefined as any
    );

    expect(mockSubscriptionCIDRsModel.findLastVersionByModelId).toBeCalledTimes(
      1
    );
    expect(response.kind).toEqual("IResponseErrorNotFound");
  });

  it("should return subscription cidrs", async () => {
    const mockSubscriptionCIDRsModel = {
      findLastVersionByModelId: vi.fn(() =>
        TE.right(O.some({ cidrs: [], subscriptionId: fakeSubscriptionId }))
      )
    };

    const getSubscriptionCidrsHandler = GetSubscriptionCidrsHandler(
      mockSubscriptionCIDRsModel as unknown as SubscriptionCIDRsModel
    );

    const response = await getSubscriptionCidrsHandler(
      mockedContext as any,
      undefined as any,
      fakeSubscriptionId as NonEmptyString
    );

    expect(response).toEqual({
      apply: expect.any(Function),
      kind: "IResponseSuccessJson",
      value: {
        cidrs: [],
        id: fakeSubscriptionId
      }
    });
    expect(
      E.isRight(SubscriptionCIDRs.decode((response as any).value))
    ).toBeTruthy();
  });
});
