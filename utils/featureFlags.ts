/**
 * Contains feature flags for the app
 */

import { fromNullable } from "fp-ts/lib/Option";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getFlagFromEnv = (name: string, defaultValue: boolean) =>
  fromNullable(process.env[name])
    .map(value => value === "1")
    .getOrElse(defaultValue);

export const flags = {
  ENABLE_USER_DATA_DELETE: getFlagFromEnv("FF_ENABLE_USER_DATA_DELETE", true),
  ENABLE_USER_DATA_DOWNLOAD: getFlagFromEnv(
    "FF_ENABLE_USER_DATA_DOWNLOAD",
    true
  )
};
