import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { agent } from "italia-ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "italia-ts-commons/lib/fetch";
import { Millisecond } from "italia-ts-commons/lib/units";
import { getActivityFunction } from "./handler";

// HTTP external requests timeout in milliseconds
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Needed to call notifications API
const publicApiUrl = getRequiredStringEnv("PUBLIC_API_URL");
const publicApiKey = getRequiredStringEnv("PUBLIC_API_KEY");
const publicDownloadBaseUrl = getRequiredStringEnv("PUBLIC_DOWNLOAD_BASE_URL");

// HTTP-only fetch with optional keepalive agent
// @see https://github.com/pagopa/io-ts-commons/blob/master/src/agent.ts#L10
const httpApiFetch = agent.getHttpFetch(process.env);

// a fetch that can be aborted and that gets cancelled after fetchTimeoutMs
const abortableFetch = AbortableFetch(httpApiFetch);
const timeoutFetch = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);

const index = getActivityFunction(
  publicApiUrl,
  publicApiKey,
  publicDownloadBaseUrl,
  timeoutFetch
);

export default index;
