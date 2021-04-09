/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonar/sonar-max-lines-per-function */

import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { aRetrievedService, aSeralizedService } from "../../__mocks__/mocks";
import { GetServiceHandler } from "../handler";

describe("GetServiceHandler", () => {
  it("should return a not found error when the requested service is not found in the db", async () => {
    const aServiceId = "1" as NonEmptyString;
    const mockServiceModel = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(none));
      })
    };

    const getServiceHandler = GetServiceHandler(mockServiceModel as any);
    const response = await getServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(response.kind).toBe("IResponseErrorNotFound");
  });

  it("should return a query error when a database error occurs", async () => {
    const aServiceId = "1" as NonEmptyString;
    const mockServiceModel = {
      findOneByServiceId: jest.fn(() => {
        return fromLeft(
          toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" })
        );
      })
    };

    const getServiceHandler = GetServiceHandler(mockServiceModel as any);
    const response = await getServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should return the requested service if found in the db", async () => {
    const aServiceId = "MySubscriptionId" as NonEmptyString;
    const mockServiceModel = {
      findOneByServiceId: jest.fn(() => {
        return fromEither(right(some(aRetrievedService)));
      })
    };

    const getServiceHandler = GetServiceHandler(mockServiceModel as any);
    const response = await getServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aSeralizedService);
    }
  });
});
