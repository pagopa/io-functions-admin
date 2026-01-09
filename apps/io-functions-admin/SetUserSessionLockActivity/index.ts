import { getConfigOrThrow } from "../utils/config";
import { timeoutFetch } from "../utils/fetch";
import { Client, createClient } from "../utils/sm-internal/client";
import { createSetUserSessionLockActivityHandler } from "./handler";

const config = getConfigOrThrow();

const sessionManagerInternalApiUrl = config.SESSION_MANAGER_INTERNAL_API_URL;
const sessionManagerInternalApiKey = config.SESSION_MANAGER_INTERNAL_API_KEY;

const client: Client<"ApiKeyAuth"> = createClient<"ApiKeyAuth">({
  baseUrl: sessionManagerInternalApiUrl,
  fetchApi: timeoutFetch,

  withDefaults: op => params =>
    op({
      ...params,
      ApiKeyAuth: sessionManagerInternalApiKey
    })
});

const activityFunctionHandler = createSetUserSessionLockActivityHandler(client);

export default activityFunctionHandler;
