import type { TokenCredential } from "@azure/core-auth";
import type { BlobClient, BlockBlobClient } from "@azure/storage-blob";
import type { Readable } from "stream";

import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { json } from "stream/consumers";

/**
 * Creates a Blob Storage credential for the current environment.
 * @param isProduction Uses managed identity in production and Azure CLI otherwise.
 * @returns A token credential for Blob Storage.
 */
export const createBlobStorageCredential = (
  isProduction: boolean
): TokenCredential =>
  isProduction ? new ManagedIdentityCredential() : new AzureCliCredential();

/**
 * Creates a Blob service client for an account endpoint.
 * @param endpoint The Blob Storage account endpoint.
 * @param credential The token credential used to authenticate.
 * @returns A client for the Blob Storage account.
 */
export const createBlobServiceClient = (
  endpoint: string,
  credential: TokenCredential
): BlobServiceClient => new BlobServiceClient(endpoint, credential);

/**
 * Gets a client for a blob in the specified container.
 * @param blobServiceClient The Blob service client to use.
 * @param containerName The container that holds the blob.
 * @param blobName The name of the blob.
 * @returns A client for the requested blob.
 */
export const getBlobClient = (
  blobServiceClient: BlobServiceClient,
  containerName: string,
  blobName: string
): BlobClient =>
  blobServiceClient.getContainerClient(containerName).getBlobClient(blobName);

/**
 * Gets a block blob client for uploading to the specified container and blob.
 * @param blobServiceClient The Blob service client to use.
 * @param containerName The target container.
 * @param blobName The target blob name.
 * @returns A client for uploading the requested block blob.
 */
export const getBlockBlobClient = (
  blobServiceClient: BlobServiceClient,
  containerName: string,
  blobName: string
): BlockBlobClient =>
  blobServiceClient
    .getContainerClient(containerName)
    .getBlockBlobClient(blobName);

/**
 * Downloads a blob as a stream and parses its UTF-8 contents as JSON.
 * Prior Blob SDK migrations observed this path to be about twice as fast as
 * `downloadToBuffer()`, whose internal `streamToBuffer` helper copies ranges
 * into a preallocated buffer and can add event-loop pressure.
 * @typeParam T The expected type of the parsed content.
 * @param blobClient The blob to download.
 * @returns The parsed JSON content.
 * @throws If the download fails or the content is not valid JSON.
 */
export const downloadBlobAsJson = async <T>(
  blobClient: BlobClient
): Promise<T> => {
  const { readableStreamBody } = await blobClient.download();
  if (!readableStreamBody) {
    throw new Error("Blob download did not return a readable stream");
  }
  return (await json(readableStreamBody)) as T;
};

/**
 * Uploads a buffer and sets the blob's content type.
 * @param blockBlobClient The target block blob client.
 * @param content The bytes to upload.
 * @param contentType The content type to store with the blob.
 * @returns The upload operation.
 */
export const uploadBlobFromBuffer = (
  blockBlobClient: BlockBlobClient,
  content: Buffer,
  contentType: string
) =>
  blockBlobClient.uploadData(content, {
    blobHTTPHeaders: { blobContentType: contentType }
  });

/**
 * Encodes and uploads text using UTF-8.
 * @param blockBlobClient The target block blob client.
 * @param content The text to upload.
 * @param contentType The content type; defaults to UTF-8 plain text.
 * @returns The upload operation.
 */
export const uploadBlobFromText = (
  blockBlobClient: BlockBlobClient,
  content: string,
  contentType = "text/plain; charset=utf-8"
) =>
  uploadBlobFromBuffer(
    blockBlobClient,
    Buffer.from(content, "utf8"),
    contentType
  );

/**
 * Serializes and uploads a value as UTF-8 JSON.
 * @typeParam T The type of the value to serialize.
 * @param blockBlobClient The target block blob client.
 * @param content The value to serialize and upload.
 * @returns The upload operation.
 */
export const uploadBlobFromJson = <T>(
  blockBlobClient: BlockBlobClient,
  content: T
) =>
  uploadBlobFromBuffer(
    blockBlobClient,
    Buffer.from(JSON.stringify(content), "utf8"),
    "application/json"
  );

/**
 * Uploads a readable stream and sets the blob's content type.
 * @param blockBlobClient The target block blob client.
 * @param readable The stream to upload.
 * @param contentType The content type to store with the blob.
 * @returns The upload operation.
 */
export const uploadBlobStream = (
  blockBlobClient: BlockBlobClient,
  readable: Readable,
  contentType: string
) =>
  blockBlobClient.uploadStream(readable, undefined, undefined, {
    blobHTTPHeaders: { blobContentType: contentType }
  });

/**
 * Deletes a blob if it exists.
 * @param blobClient The blob to delete.
 * @returns `true` when the deletion request completes without an error.
 */
export const deleteBlobIfExists = async (
  blobClient: BlobClient
): Promise<true> => {
  await blobClient.deleteIfExists();
  return true;
};

/**
 * Checks whether an error has the exact `BlobNotFound` service error code.
 * @param error The value to inspect.
 * @returns `true` only when the error code is `BlobNotFound`.
 */
export const isBlobNotFoundError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "BlobNotFound";
