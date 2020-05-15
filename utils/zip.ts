import * as archiver from "archiver";
import * as achiverEncryptedFormat from "archiver-zip-encrypted";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Readable } from "stream";
archiver.registerFormat("zip-encrypted", achiverEncryptedFormat);

export enum EncryptionMethodEnum {
  ZIP20 = "zip20",
  AES256 = "aes256"
}

export const DEFAULT_ENCRYPTION_METHOD = EncryptionMethodEnum.ZIP20;
export const DEFAULT_ZLIB_LEVEL = 8;

export const createCompressedStream = (
  // tslint:disable-next-line: no-any
  data: Record<string, any>,
  password?: NonEmptyString,
  encryptionMethod: EncryptionMethodEnum = EncryptionMethodEnum.ZIP20
): Readable => {
  const zipArchive = password
    ? archiver("zip-encrypted", {
        encryptionMethod,
        password,
        zlib: { level: DEFAULT_ZLIB_LEVEL }
      })
    : archiver("zip", {
        zlib: { level: DEFAULT_ZLIB_LEVEL }
      });

  Object.entries(data).forEach(([fileName, content]) => {
    zipArchive.append(JSON.stringify(content), { name: fileName });
  });
  zipArchive.finalize();

  return zipArchive;
};
