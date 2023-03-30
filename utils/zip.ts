import * as archiver from "archiver";
import { StrongPassword } from "./password";

const initArchiverZipEncryptedPlugin = {
  called: false,
  // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
  run(): void {
    if (!initArchiverZipEncryptedPlugin.called) {
      // eslint-disable-next-line functional/immutable-data
      initArchiverZipEncryptedPlugin.called = true;
      // note: only do it once per Node.js process/application, as duplicate registration will throw an error
      archiver.registerFormat(
        "zip-encrypted",
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("archiver-zip-encrypted")
      );
    }
  }
};

export enum EncryptionMethodEnum {
  ZIP20 = "zip20",
  AES256 = "aes256"
}

export const DEFAULT_ZIP_ENCRYPTION_METHOD = EncryptionMethodEnum.ZIP20;
export const DEFAULT_ZLIB_LEVEL = 8;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getEncryptedZipStream(
  password: StrongPassword
): archiver.Archiver {
  initArchiverZipEncryptedPlugin.run();
  return archiver.create("zip-encrypted", {
    encryptionMethod: DEFAULT_ZIP_ENCRYPTION_METHOD,
    password,
    zlib: {
      level: DEFAULT_ZLIB_LEVEL
    }
    // following cast due to incomplete archive typings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
