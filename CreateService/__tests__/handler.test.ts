/* tslint:disable: no-any */
/* tslint:disable: no-big-function */

import { left, right } from "fp-ts/lib/Either";
import { none } from "fp-ts/lib/Option";

import {
  aRetrievedService,
  aSeralizedService,
  aService,
  aServicePayload
} from "../../utils/mocks";
import { CreateServiceHandler } from "../handler";

describe("CreateServiceHandler", () => {
  it("should return a query error if the service fails to be created", async () => {
    const mockServiceModel = {
      create: jest.fn(() => {
        return Promise.resolve(left({}));
      })
    };

    const createServiceHandler = CreateServiceHandler(
      undefined as any,
      mockServiceModel as any
    );

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(
      aService,
      aServicePayload.service_id
    );
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should create a new service using the payload and return the created service", async () => {
    const mockServiceModel = {
      create: jest.fn(() => {
        return Promise.resolve(right(aRetrievedService));
      }),
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(none));
      })
    };

    const createServiceHandler = CreateServiceHandler(
      undefined as any,
      mockServiceModel as any
    );

    const response = await createServiceHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServicePayload
    );

    expect(mockServiceModel.create).toHaveBeenCalledWith(
      aService,
      aServicePayload.service_id
    );
    expect(response.kind).toBe("IResponseSuccessJson");
    if (response.kind === "IResponseSuccessJson") {
      expect(response.value).toEqual(aSeralizedService);
    }
  });
});
