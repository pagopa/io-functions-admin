/* tslint:disable: no-any */

import { left, right } from "fp-ts/lib/Either";
import * as asyncI from "io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { aRetrievedService, aSeralizedService } from "../../__mocks__/mocks";
import { GetServicesHandler } from "../handler";

const mockNext = jest.fn();
const serviceAsyncIterator = {
  next: mockNext
};

const serviceIteratorErrorMock = {
  next: jest.fn(() =>
    Promise.resolve({
      done: false,
      value: jest.fn(() => [
        left(toCosmosErrorResponse(new Error("Query Error")))
      ])
    })
  )
};

const symbolAsyncIterator = jest.fn(() => {
  return {
    [Symbol.asyncIterator]: () => serviceAsyncIterator
  };
});

const symbolAsyncErrorIterator = jest.fn(() => {
  return {
    [Symbol.asyncIterator]: () => serviceIteratorErrorMock
  };
});

describe("GetServices", () => {
  it("Should return a query error when a database error occurs", async () => {
    jest
      .spyOn(asyncI, "mapAsyncIterable")
      .mockImplementationOnce(symbolAsyncErrorIterator);

    const mockServiceModel = {
      getCollectionIterator: symbolAsyncErrorIterator
    };

    const getServicesHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServicesHandler(
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(mockServiceModel.getCollectionIterator).toHaveBeenCalledWith();
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("Should return the collection of services from the database", async () => {
    jest
      .spyOn(asyncI, "mapAsyncIterable")
      .mockImplementationOnce(symbolAsyncIterator);

    mockNext.mockImplementationOnce(async () => ({
      done: false,
      value: [
        right(aRetrievedService),
        right({
          ...aRetrievedService,
          version: 3
        }),
        right({
          ...aRetrievedService,
          version: 2
        })
      ]
    }));
    mockNext.mockImplementationOnce(async () => ({
      done: true,
      value: undefined
    }));
    const mockServiceModel = {
      getCollectionIterator: symbolAsyncIterator
    };

    const getServicesHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServicesHandler(
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(mockServiceModel.getCollectionIterator).toHaveBeenCalledWith();
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual({
        items: [
          {
            ...aSeralizedService,
            service_metadata: undefined,
            version: 3
          }
        ],
        page_size: 1
      });
    }
  });
});
