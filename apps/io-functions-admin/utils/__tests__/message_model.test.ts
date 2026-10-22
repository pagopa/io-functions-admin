import type { BlobServiceClient } from "@azure/storage-blob";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import { aMessageContent } from "../../__mocks__/mocks";
import {
  MessageContentReaderModel,
  MessageDeletableModel
} from "../extensions/models/message";

const messageId = "message-id";
const containerName = "message-content";

const setup = () => {
  const blobClient = {
    deleteIfExists: vi.fn(),
    downloadToBuffer: vi.fn()
  };
  const containerClient = { getBlobClient: vi.fn(() => blobClient) };
  const blobServiceClient = {
    getContainerClient: vi.fn(() => containerClient)
  } as unknown as BlobServiceClient;
  const model = new MessageDeletableModel(
    {} as never,
    containerName as NonEmptyString
  );
  const readerModel = new MessageContentReaderModel(
    {} as never,
    containerName as NonEmptyString
  );

  return {
    blobClient,
    blobServiceClient,
    containerClient,
    model,
    readerModel
  };
};

describe("MessageContentReaderModel Blob content", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads and decodes <messageId>.json", async () => {
    const { blobClient, blobServiceClient, containerClient, readerModel } =
      setup();
    blobClient.downloadToBuffer.mockResolvedValue(
      Buffer.from(JSON.stringify(aMessageContent))
    );

    const result = await readerModel.getContentFromStorage(
      blobServiceClient,
      messageId
    )();

    expect(result).toEqual(E.right(O.some(aMessageContent)));
    expect(blobServiceClient.getContainerClient).toHaveBeenCalledWith(
      containerName
    );
    expect(containerClient.getBlobClient).toHaveBeenCalledWith(
      `${messageId}.json`
    );
  });

  it("maps only BlobNotFound to none", async () => {
    const { blobClient, blobServiceClient, readerModel } = setup();
    blobClient.downloadToBuffer.mockRejectedValue(
      Object.assign(new Error("Blob not found"), {
        code: "BlobNotFound",
        statusCode: 404
      })
    );

    const result = await readerModel.getContentFromStorage(
      blobServiceClient,
      messageId
    )();

    expect(result).toEqual(E.right(O.none));
  });

  it.each([
    Object.assign(new Error("Container not found"), {
      code: "ContainerNotFound",
      statusCode: 404
    }),
    Object.assign(new Error("Forbidden"), {
      code: "AuthorizationFailure",
      statusCode: 403
    })
  ])("propagates storage failures: %s", async error => {
    const { blobClient, blobServiceClient, readerModel } = setup();
    blobClient.downloadToBuffer.mockRejectedValue(error);

    const result = await readerModel.getContentFromStorage(
      blobServiceClient,
      messageId
    )();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left).toBe(error);
    }
  });

  it.each(["", "not-json", "{}"])(
    "propagates empty, malformed, or invalid content %s",
    async content => {
      const { blobClient, blobServiceClient, readerModel } = setup();
      blobClient.downloadToBuffer.mockResolvedValue(Buffer.from(content));

      const result = await readerModel.getContentFromStorage(
        blobServiceClient,
        messageId
      )();

      expect(E.isLeft(result)).toBe(true);
    }
  );

  it("deletes content without masking storage errors", async () => {
    const { blobClient, blobServiceClient, containerClient, model } = setup();
    blobClient.deleteIfExists.mockResolvedValue({ succeeded: true });

    const result = await model.deleteContentFromStorage(
      blobServiceClient,
      messageId
    )();

    expect(result).toEqual(E.right(true));
    expect(containerClient.getBlobClient).toHaveBeenCalledWith(
      `${messageId}.json`
    );

    const forbidden = new Error("403 Forbidden");
    blobClient.deleteIfExists.mockRejectedValueOnce(forbidden);
    const failure = await model.deleteContentFromStorage(
      blobServiceClient,
      messageId
    )();

    expect(failure).toEqual(E.left(forbidden));
  });
});
