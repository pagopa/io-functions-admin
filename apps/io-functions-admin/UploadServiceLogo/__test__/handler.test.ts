/* eslint-disable @typescript-eslint/no-explicit-any */

import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import { Logo } from "../../generated/definitions/Logo";
import { UpdateServiceLogoHandler } from "../handler";

describe("UpdateServiceLogoHandler", () => {
  it("should return a not found error when the service is not found in the db", async () => {
    const aServiceId = "1" as NonEmptyString;
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(none))
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      undefined as any,
      undefined as any
    );
    const response = await updateServiceLogoHandler(
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
      findOneByServiceId: vi.fn(() =>
        TE.left(toCosmosErrorResponse({ kind: "COSMOS_ERROR_RESPONSE" }))
      )
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      undefined as any,
      undefined as any
    );
    const response = await updateServiceLogoHandler(
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
      logo: "AAAAAAAA"
    } as Logo;
    const mockedContext = {
      bindings: {
        logo: undefined
      }
    };

    const blobServiceMock = ({
      createBlockBlobFromText: vi.fn((_, __, ___, cb) => cb(null, "any"))
    } as any) as BlobService;
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceMock,
      logosUrl
    );
    const response = await updateServiceLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      aServiceId,
      requestPayload
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );
    expect(mockedContext.bindings.logo).toBeUndefined();
    expect(response.kind).toBe("IResponseErrorValidation");
  });

  it("should return a success response if the request payload is valid", async () => {
    const requestPayload = {
      logo:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };
    const blobServiceMock = ({
      createBlockBlobFromText: vi.fn((_, __, ___, cb) => cb(null, "any"))
    } as any) as BlobService;
    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceMock,
      logosUrl
    );
    const response = await updateServiceLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      aServiceId,
      requestPayload
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );

    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should return an internal error response if blob write fails", async () => {
    const requestPayload = {
      logo:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };
    const blobServiceMock = ({
      createBlockBlobFromText: vi.fn((_, __, ___, cb) => cb("any", null))
    } as any) as BlobService;
    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceMock,
      logosUrl
    );
    const response = await updateServiceLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      aServiceId,
      requestPayload
    );

    expect(mockServiceModel.findOneByServiceId).toHaveBeenCalledWith(
      aServiceId
    );

    expect(response.kind).toBe("IResponseErrorInternal");
  });
});
