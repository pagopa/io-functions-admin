import * as azureStorage from "azure-storage";
import { Either, left, right } from "fp-ts/lib/Either";

export * from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";

/**
 * Deletes a blof if exists
 * Assumes that the container <containerName> already exists.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob storage container name
 */
export function deleteBlob(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string
): Promise<Either<Error, true>> {
  return new Promise(resolve =>
    blobService.deleteBlobIfExists(containerName, blobName, err => {
      if (err) {
        return resolve(left(err));
      } else {
        return resolve(right(true));
      }
    })
  );
}
