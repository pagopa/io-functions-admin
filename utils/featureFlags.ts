/**
 *
 */

import { fromNullable } from "fp-ts/lib/Option";
import * as t from "io-ts";

const getEnvVariable = (decoder: t.Mixed) => (
  name: string,
  defaultValue: typeof decoder["_A"]
) =>
  fromNullable(process.env[name])
    .map(decoder.decode)
    .getOrElse(defaultValue);

const getFlagFromEnv = getEnvVariable(t.boolean);

export const flags = {
  ENABLE_USER_DATA_DELETE: getFlagFromEnv("FF_ENABLE_USER_DATA_DELETE", true),
  ENABLE_USER_DATA_DOWNLOAD: getFlagFromEnv(
    "FF_ENABLE_USER_DATA_DOWNLOAD",
    true
  )
};
