/* eslint-disable @typescript-eslint/no-explicit-any */

import type { BlobServiceClient } from "@azure/storage-blob";

import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { none, some } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { describe, expect, it, vi } from "vitest";

import { Logo } from "../../generated/definitions/Logo";
import { UpdateServiceLogoHandler } from "../handler";

const setup = () => {
  const uploadData = vi.fn().mockResolvedValue({});
  const blockBlobClient = { uploadData };
  const containerClient = {
    getBlockBlobClient: vi.fn(() => blockBlobClient)
  };
  const blobServiceClient = {
    getContainerClient: vi.fn(() => containerClient)
  } as unknown as BlobServiceClient;

  return { blobServiceClient, containerClient, uploadData };
};

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

    const { blobServiceClient } = setup();
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };

    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceClient,
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
      logo: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };
    const { blobServiceClient, containerClient, uploadData } = setup();
    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceClient,
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
    expect(containerClient.getBlockBlobClient).toHaveBeenCalledWith("1.png");
    expect(uploadData).toHaveBeenCalledWith(
      Buffer.from(requestPayload.logo, "base64"),
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "image/png" }
      })
    );
  });

  it("should return an internal error response if blob write fails", async () => {
    const requestPayload = {
      logo: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const aServiceId = "1" as NonEmptyString;
    const logosUrl = "LOGOS_URL";
    const mockServiceModel = {
      findOneByServiceId: vi.fn(() => TE.right(some({})))
    };
    const { blobServiceClient, uploadData } = setup();
    uploadData.mockRejectedValue(new Error("write failed"));
    const updateServiceLogoHandler = UpdateServiceLogoHandler(
      mockServiceModel as any,
      blobServiceClient,
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
