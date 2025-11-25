/**
 * Contains feature flags for the app
 */

import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";

const getFlagFromEnv = (name: string, defaultValue: boolean) =>
  pipe(
    O.fromNullable(process.env[name]),
    O.map(value => value === "1"),
    O.getOrElse(() => defaultValue)
  );

export const flags = {
  ENABLE_USER_DATA_DELETE: getFlagFromEnv("FF_ENABLE_USER_DATA_DELETE", true),
  ENABLE_USER_DATA_DOWNLOAD: getFlagFromEnv(
    "FF_ENABLE_USER_DATA_DOWNLOAD",
    true
  )
};
