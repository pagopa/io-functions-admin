import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { timeoutFetch } from "../utils/fetch";
import { getActivityFunction } from "./handler";

// Needed to call notifications API
const publicApiUrl = getRequiredStringEnv("PUBLIC_API_URL");
const publicApiKey = getRequiredStringEnv("PUBLIC_API_KEY");
const publicDownloadBaseUrl = getRequiredStringEnv("PUBLIC_DOWNLOAD_BASE_URL");

const index = getActivityFunction(
  publicApiUrl,
  publicApiKey,
  publicDownloadBaseUrl,
  timeoutFetch
);

export default index;
