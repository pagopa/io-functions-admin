import { getFetch } from "@pagopa/ts-commons/lib/agent";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { Millisecond } from "@pagopa/ts-commons/lib/units";

// HTTP external requests timeout in milliseconds
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

// Generic HTTP/HTTPS fetch with optional keepalive agent
// @see https://github.com/pagopa/io-ts-commons/blob/master/src/agent.ts#L10
const httpOrHttpsApiFetch = getFetch(process.env);

// a fetch that can be aborted and that gets cancelled after fetchTimeoutMs
const abortableFetch = AbortableFetch(httpOrHttpsApiFetch);

export const timeoutFetch = toFetch(
  setFetchTimeout(DEFAULT_REQUEST_TIMEOUT_MS as Millisecond, abortableFetch)
);
