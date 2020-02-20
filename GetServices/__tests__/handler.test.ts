/* tslint:disable: no-any */

import { left, right } from "fp-ts/lib/Either";

import { aRetrievedService } from "../../__mocks__/mocks";
import { GetServicesHandler } from "../handler";

describe("GetServices", () => {
  it("Should return a query error when a database error occurs", async () => {
    const mockServiceModel = {
      getCollectionIterator: jest.fn(() => {
        return Promise.resolve(left({}));
      })
    };

    const getServiceHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServiceHandler(
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(mockServiceModel.getCollectionIterator).toHaveBeenCalledWith();
    expect(response.kind).toBe("IResponseSuccessJsonIterator");
  });

  it("Should return the collection of services from the database", async () => {
    const mockServiceModel = {
      getCollectionIterator: jest.fn(() =>
        Promise.resolve({
          executeNext: () => Promise.resolve(right([aRetrievedService]))
        })
      )
    };

    const getServiceHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServiceHandler(
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(mockServiceModel.getCollectionIterator).toHaveBeenCalledWith();
    expect(response.kind).toBe("IResponseSuccessJsonIterator");
  });
});
