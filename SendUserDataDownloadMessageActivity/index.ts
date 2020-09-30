import { getConfig } from "../utils/config";
import { timeoutFetch } from "../utils/fetch";
import { getActivityFunction } from "./handler";

const config = getConfig();

// Needed to call notifications API
const publicApiUrl = config.PUBLIC_API_URL;
const publicApiKey = config.PUBLIC_API_KEY;
const publicDownloadBaseUrl = config.PUBLIC_DOWNLOAD_BASE_URL;

const index = getActivityFunction(
  publicApiUrl,
  publicApiKey,
  publicDownloadBaseUrl,
  timeoutFetch
);

export default index;
