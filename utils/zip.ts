import * as archiver from "archiver";

export const initArchiverZipEncryptedPlugin = {
  called: false,
  run(): void {
    if (!initArchiverZipEncryptedPlugin.called) {
      // tslint:disable-next-line: no-object-mutation
      initArchiverZipEncryptedPlugin.called = true;
      // note: only do it once per Node.js process/application, as duplicate registration will throw an error
      archiver.registerFormat(
        "zip-encrypted",
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
