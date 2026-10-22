/* eslint-disable @typescript-eslint/no-explicit-any */

import type { BlobServiceClient } from "@azure/storage-blob";

import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { describe, expect, it, vi } from "vitest";

import { Logo } from "../../generated/definitions/Logo";
import { UploadOrganizationLogoHandler } from "../handler";

const anOrganizationFiscalCode = "00012345678" as OrganizationFiscalCode;
const logosUrl = "LOGOS_URL";

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

describe("UploadOrganizationLogoHandler", () => {
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

    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceClient,
      logosUrl
    );
    const response = await uploadOrganizationLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      anOrganizationFiscalCode,
      requestPayload
    );

    expect(response.kind).toBe("IResponseErrorValidation");
  });

  it("should return a success response if the request payload is valid", async () => {
    const requestPayload = {
      logo: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const { blobServiceClient, containerClient, uploadData } = setup();
    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceClient,
      logosUrl
    );
    const response = await uploadOrganizationLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      anOrganizationFiscalCode,
      requestPayload
    );

    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
    // The Blob filename uses the organization fiscal code without leading zeros.
    expect(containerClient.getBlockBlobClient).toHaveBeenCalledWith(
      `${anOrganizationFiscalCode.replace(/^0+/, "")}.png`
    );
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
    const { blobServiceClient, uploadData } = setup();
    uploadData.mockRejectedValue(new Error("write failed"));
    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceClient,
      logosUrl
    );
    const response = await uploadOrganizationLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      anOrganizationFiscalCode,
      requestPayload
    );
    expect(response.kind).toBe("IResponseErrorInternal");
  });
});
