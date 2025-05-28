import { getConfigOrThrow } from "../utils/config";
import { timeoutFetch } from "../utils/fetch";
import { Client, createClient } from "../utils/sm-internal/client";
import { createSetUserSessionLockActivityHandler } from "./handler";

const config = getConfigOrThrow();

const sessionApiUrl = config.SESSION_API_URL;
const sessionApiKey = config.SESSION_API_KEY;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sessionManagerInternalApiUrl = config.SESSION_MANAGER_INTERNAL_API_URL;
const sessionManagerInternalApiKey = config.SESSION_MANAGER_INTERNAL_API_KEY;

const client: Client<"ApiKeyAuth"> = createClient<"ApiKeyAuth">({
  baseUrl: sessionApiUrl,
  fetchApi: timeoutFetch,
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  withDefaults: op => params =>
    op({
      ...params,
      ApiKeyAuth: sessionManagerInternalApiKey,
      token: sessionApiKey
    })
});

const activityFunctionHandler = createSetUserSessionLockActivityHandler(client);

export default activityFunctionHandler;
