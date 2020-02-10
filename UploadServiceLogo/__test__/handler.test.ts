/* tslint:disable: no-any */

import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";

import { NonEmptyString } from "italia-ts-commons/lib/strings";

import { Logo } from "../../generated/definitions/Logo";
import { UpdateServiceLogoHandler } from "../handler";

describe("UpdateServiceLogoHandler", () => {
  it("should return a not found error when the service is not found in the db", async () => {
    const aServiceId = "1" as NonEmptyString;
    const mockServiceModel = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(none));
      })
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      undefined as any
    );
    const response = await updateServiceLogoHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId,
      undefined as any // Not used
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
        return Promise.resolve(left({}));
      })
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      undefined as any
    );
    const response = await updateServiceLogoHandler(
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId,
      undefined as any // Not used
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(response.kind).toBe("IResponseErrorQuery");
  });

  it("should return a validation error response if the request payload is invalid", async () => {
    const requestPayload = {
      logo:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {
      bindings: {
        logo: undefined
      }
    };
    const aServiceId = "1" as NonEmptyString;
    const logosHost = "LOGOS_HOST";
    const mockServiceModel = {
      findOneByServiceId: jest.fn(() => {
        return Promise.resolve(right(some({})));
      })
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      logosHost
    );
    const response = await updateServiceLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      undefined as any, // Not used
      undefined as any, // Not used
      aServiceId,
      requestPayload
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(mockedContext.bindings.logo).toBeDefined();
    expect(mockedContext.bindings.logo.toString("base64")).toEqual(
      requestPayload.logo
    );
    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });
});
