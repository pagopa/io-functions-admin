/* tslint:disable: no-any */

import { left, right } from "fp-ts/lib/Either";

import { none, some } from "fp-ts/lib/Option";
import { aRetrievedService, aSeralizedService } from "../../__mocks__/mocks";
import { GetServicesHandler } from "../handler";

describe("GetServices", () => {
  it("Should return a query error when a database error occurs", async () => {
    const mockServiceModel = {
      getCollectionIterator: jest.fn(() =>
        Promise.resolve({
          executeNext: () => Promise.resolve(left(new Error()))
        })
      )
    };

    const getServicesHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServicesHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any // Not used
    );

    expect(mockServiceModel.getCollectionIterator).toHaveBeenCalledWith();
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("Should return the collection of services from the database", async () => {
    const mockServiceModel = {
      getCollectionIterator: jest.fn(() =>
        Promise.resolve({
          executeNext: jest
            .fn()
            .mockImplementationOnce(() =>
              Promise.resolve(
                right(
                  some([
                    aRetrievedService,
                    {
                      ...aRetrievedService,
                      version: 3
                    },
                    {
                      ...aRetrievedService,
                      version: 2
                    }
                  ])
                )
              )
            )
            .mockImplementationOnce(() => Promise.resolve(right(none)))
        })
      )
    };

    const getServicesHandler = GetServicesHandler(mockServiceModel as any);

    const response = await getServicesHandler(
      undefined as any, // Not used
      undefined as any, // Not used
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
