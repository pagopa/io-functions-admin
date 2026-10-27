import type {
  BlobClient,
  BlockBlobClient,
  HttpOperationResponse,
  RequestPolicy,
  RequestPolicyOptions,
  WebResource
} from "@azure/storage-blob";

import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import { RestError } from "@azure/storage-blob";
import { PassThrough, Readable } from "stream";
import { describe, expect, it, vi } from "vitest";

import {
  createBlobStorageCredential,
  deleteBlobIfExists,
  downloadBlobAsJson,
  forbiddenBlobWritePolicyFactory,
  isBlobNotFoundError,
  uploadBlobFromBuffer,
  uploadBlobFromJson,
  uploadBlobStream
} from "../blob_storage";

const createPolicyResponse = (
  status: number,
  serviceErrorCode?: string
): HttpOperationResponse =>
  ({
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-ms-error-code" ? serviceErrorCode : undefined
    },
    status
  }) as unknown as HttpOperationResponse;

const createPolicyRequest = (method: WebResource["method"]): WebResource =>
  ({
    headers: {},
    method,
    url: "https://storage.example/CFTEST1234/archive.zip"
  }) as unknown as WebResource;

const policyOptions: RequestPolicyOptions = {
  log: () => undefined,
  shouldLog: () => false
};

describe("Blob storage helpers", () => {
  it("selects an explicit developer or managed identity credential", () => {
    expect(createBlobStorageCredential(false)).toBeInstanceOf(
      AzureCliCredential
    );
    expect(createBlobStorageCredential(true)).toBeInstanceOf(
      ManagedIdentityCredential
    );
  });

  it("downloads JSON", async () => {
    const blobClient = {
      download: vi.fn().mockResolvedValue({
        readableStreamBody: Readable.from([
          Buffer.from('{"value":"ok"}', "utf8")
        ])
      })
    } as unknown as BlobClient;

    await expect(downloadBlobAsJson(blobClient)).resolves.toEqual({
      value: "ok"
    });
    expect(blobClient.download).toHaveBeenCalledTimes(1);
  });

  it("fails if a download response has no readable stream", async () => {
    const blobClient = {
      download: vi.fn().mockResolvedValue({ readableStreamBody: undefined })
    } as unknown as BlobClient;

    await expect(downloadBlobAsJson(blobClient)).rejects.toThrow(
      "Blob download did not return a readable stream"
    );
  });

  it("propagates errors raised while consuming the download stream", async () => {
    const streamError = new Error("stream failed");
    const readableStreamBody = Readable.from(
      (async function* () {
        yield Buffer.from('{"value":');
        throw streamError;
      })()
    );
    const blobClient = {
      download: vi.fn().mockResolvedValue({ readableStreamBody })
    } as unknown as BlobClient;

    await expect(downloadBlobAsJson(blobClient)).rejects.toThrow(
      "stream failed"
    );
  });

  it("uploads JSON, buffers, and streams with their content types", async () => {
    const uploadData = vi.fn().mockResolvedValue({});
    const uploadStream = vi.fn().mockResolvedValue({});
    const blockBlobClient = {
      uploadData,
      uploadStream
    } as unknown as BlockBlobClient;
    const buffer = Buffer.from("image");
    const readable = new PassThrough();

    await uploadBlobFromJson(blockBlobClient, { value: "ok" });
    await uploadBlobFromBuffer(blockBlobClient, buffer, "image/png");
    await uploadBlobStream(blockBlobClient, readable, "application/zip");

    expect(uploadData).toHaveBeenNthCalledWith(
      1,
      Buffer.from('{"value":"ok"}'),
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "application/json" }
      })
    );
    expect(uploadData).toHaveBeenNthCalledWith(
      2,
      buffer,
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "image/png" }
      })
    );
    expect(uploadStream).toHaveBeenCalledWith(
      readable,
      undefined,
      undefined,
      expect.objectContaining({
        blobHTTPHeaders: { blobContentType: "application/zip" }
      })
    );
  });

  it("propagates deletion failures", async () => {
    const blobClient = {
      deleteIfExists: vi.fn().mockRejectedValue(new Error("403 Forbidden"))
    } as unknown as BlobClient;

    await expect(deleteBlobIfExists(blobClient)).rejects.toThrow(
      "403 Forbidden"
    );
  });

  it("recognizes only the BlobNotFound service error code", () => {
    expect(isBlobNotFoundError({ code: "BlobNotFound", statusCode: 404 })).toBe(
      true
    );
    expect(
      isBlobNotFoundError({ code: "ContainerNotFound", statusCode: 404 })
    ).toBe(false);
    expect(isBlobNotFoundError({ statusCode: 404 })).toBe(false);
  });
});

describe("forbidden Blob write policy", () => {
  it("turns a resolved PUT 403 response into a safe RestError", async () => {
    const response = createPolicyResponse(
      403,
      "AuthorizationPermissionMismatch"
    );
    const sendRequest = vi.fn().mockResolvedValue(response);
    const nextPolicy: RequestPolicy = { sendRequest };
    const request = createPolicyRequest("PUT");
    const policy = forbiddenBlobWritePolicyFactory.create(
      nextPolicy,
      policyOptions
    );

    let caughtError: unknown;
    try {
      await policy.sendRequest(request);
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(RestError);
    expect(caughtError).toMatchObject({
      code: "AuthorizationPermissionMismatch",
      statusCode: 403
    });
    if (caughtError instanceof Error) {
      expect(caughtError.message).toContain("HTTP 403");
      expect(caughtError.message).not.toContain(request.url);
    }
    expect(sendRequest).toHaveBeenCalledWith(request);
  });

  it.each([
    { method: "PUT", status: 201 },
    { method: "PUT", status: 500 },
    { method: "GET", status: 403 },
    { method: "HEAD", status: 403 }
  ] as const)(
    "passes through $method responses with status $status",
    async ({ method, status }) => {
      const response = createPolicyResponse(status);
      const nextPolicy: RequestPolicy = {
        sendRequest: vi.fn().mockResolvedValue(response)
      };
      const policy = forbiddenBlobWritePolicyFactory.create(
        nextPolicy,
        policyOptions
      );

      await expect(
        policy.sendRequest(createPolicyRequest(method))
      ).resolves.toBe(response);
    }
  );
});
