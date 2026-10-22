import type { BlobClient, BlockBlobClient } from "@azure/storage-blob";

import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import { PassThrough } from "stream";
import { describe, expect, it, vi } from "vitest";

import {
  createBlobStorageCredential,
  deleteBlobIfExists,
  downloadBlobAsJson,
  isBlobNotFoundError,
  uploadBlobFromBuffer,
  uploadBlobFromJson,
  uploadBlobStream
} from "../blob_storage";

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
      downloadToBuffer: vi
        .fn()
        .mockResolvedValue(Buffer.from('{"value":"ok"}', "utf8"))
    } as unknown as BlobClient;

    await expect(downloadBlobAsJson(blobClient)).resolves.toEqual({
      value: "ok"
    });
    expect(blobClient.downloadToBuffer).toHaveBeenCalledTimes(1);
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
