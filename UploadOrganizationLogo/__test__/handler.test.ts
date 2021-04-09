/* eslint-disable @typescript-eslint/no-explicit-any */

import { OrganizationFiscalCode } from "italia-ts-commons/lib/strings";

import { BlobService } from "azure-storage";
import { Logo } from "../../generated/definitions/Logo";
import { UploadOrganizationLogoHandler } from "../handler";

const anOrganizationFiscalCode = "00000000000" as OrganizationFiscalCode;
const logosUrl = "LOGOS_URL";
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

    const blobServiceMock = ({
      createBlockBlobFromText: jest.fn((_, __, ___, cb) => {
        return cb(null, "any");
      })
    } as any) as BlobService;

    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceMock,
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
      logo:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const blobServiceMock = ({
      createBlockBlobFromText: jest.fn((_, __, ___, cb) => cb(null, "any"))
    } as any) as BlobService;
    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceMock,
      logosUrl
    );
    const response = await uploadOrganizationLogoHandler(
      mockedContext as any,
      undefined as any, // Not used
      anOrganizationFiscalCode,
      requestPayload
    );

    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });

  it("should return an internal error response if blob write fails", async () => {
    const requestPayload = {
      logo:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    } as Logo;
    const mockedContext = {};
    const blobServiceMock = ({
      createBlockBlobFromText: jest.fn((_, __, ___, cb) => cb("any", null))
    } as any) as BlobService;
    const uploadOrganizationLogoHandler = UploadOrganizationLogoHandler(
      blobServiceMock,
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
