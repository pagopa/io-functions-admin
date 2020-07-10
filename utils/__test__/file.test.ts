/* tslint:disable: no-any */

import { BlobService } from "azure-storage";
import { isLeft, isRight, left, right } from "fp-ts/lib/Either";
import { isSome, some } from "fp-ts/lib/Option";
import * as azureStorage from "io-functions-commons/dist/src/utils/azure_storage";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { getCsvFromURL, getFileFromBlob, writeBlobFromJson } from "../file";

const aValidURL = "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-italiani.csv" as NonEmptyString;
const anInvalidURL = "https://www.istat.it/storage/codici-unita-amministrative/Elenco-comuni-ita.csv" as NonEmptyString;
const aValidContainerName = "municipalities" as NonEmptyString;
const aValidBlobName = "municipalities_with_catastale.csv" as NonEmptyString;
const aFileContent = "a file content";
const aBlobResult = {} as BlobService.BlobResult;

describe("getCsvFromURL", () => {
  it("should return a string representation of a csv file", async () => {
    const result = await getCsvFromURL(aValidURL).run();
    expect(isRight(result)).toBe(true);
  });

  it("should return an error if no file was provided", async () => {
    const result = await getCsvFromURL(anInvalidURL).run();

    expect(isLeft(result)).toBe(true);
    if (isLeft(result)) {
      expect(result.value.message).toEqual(
        "Error fetching file from remote URL"
      );
    }
  });
});

describe("getFileFromBlob", () => {
  const blobServiceMock = {};
  it("should return an error if blob does not exist", async () => {
    const err = Error();
    const getBlobAsTextSpy = jest
      .spyOn(azureStorage, "getBlobAsText")
      .mockReturnValueOnce(Promise.resolve(left(err)));

    const result = await getFileFromBlob(
      blobServiceMock as any,
      "" as any,
      "" as any
    ).run();

    expect(getBlobAsTextSpy).toBeCalledWith(
      blobServiceMock,
      expect.any(String), // Container name
      expect.any(String) // Blob name
    );
    expect(isLeft(result)).toBe(true);
  });

  it("should return a string file giving the right blob path", async () => {
    const getBlobAsTextSpy = jest
      .spyOn(azureStorage, "getBlobAsText")
      .mockReturnValueOnce(Promise.resolve(right(some(aFileContent))));

    const result = await getFileFromBlob(
      blobServiceMock as any,
      aValidContainerName,
      aValidBlobName
    ).run();

    expect(getBlobAsTextSpy).toBeCalledWith(
      blobServiceMock,
      aValidContainerName,
      aValidBlobName
    );

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(isSome(result.value)).toBe(true);
    }
  });
});

describe("writeBlobFromJson", () => {
  const blobServiceMock = {};
  it("should return an error if blob does not exist", async () => {
    const err = Error();
    const upsertBlobFromTextSpy = jest
      .spyOn(azureStorage, "upsertBlobFromText")
      .mockReturnValueOnce(Promise.resolve(left(err)));

    const result = await writeBlobFromJson(
      blobServiceMock as any,
      "" as any,
      "" as any,
      aFileContent as any
    ).run();

    expect(upsertBlobFromTextSpy).toBeCalledWith(
      blobServiceMock,
      expect.any(String), // Container name
      expect.any(String), // Blob name
      aFileContent as any
    );
    expect(isLeft(result)).toBe(true);
  });

  it("should upsert a file giving the right blob path", async () => {
    const upsertBlobFromTextSpy = jest
      .spyOn(azureStorage, "upsertBlobFromText")
      .mockReturnValueOnce(Promise.resolve(right(some(aBlobResult))));

    const result = await writeBlobFromJson(
      blobServiceMock as any,
      aValidContainerName,
      aValidBlobName,
      aFileContent as any
    ).run();

    expect(upsertBlobFromTextSpy).toBeCalledWith(
      blobServiceMock,
      aValidContainerName,
      aValidBlobName,
      aFileContent
    );

    expect(isRight(result)).toBe(true);
    if (isRight(result)) {
      expect(isSome(result.value)).toBe(true);
    }
  });
});
