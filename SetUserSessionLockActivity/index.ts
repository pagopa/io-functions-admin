import { getConfig } from "../utils/config";
import { timeoutFetch } from "../utils/fetch";
import {
  ApiOperation,
  Client,
  createClient,
  WithDefaultsT
} from "../utils/sessionApiClient";
import { createSetUserSessionLockActivityHandler } from "./handler";

const config = getConfig();

const sessionApiUrl = config.SESSION_API_URL;
const sessionApiKey = config.SESSION_API_KEY;

const withDefaultApiKey: WithDefaultsT<"token"> = (
  apiOperation: ApiOperation
) => params => apiOperation({ ...params, token: sessionApiKey });

const client: Client<"token"> = createClient({
  baseUrl: sessionApiUrl,
  fetchApi: timeoutFetch,
  withDefaults: withDefaultApiKey
});

const activityFunctionHandler = createSetUserSessionLockActivityHandler(client);

export default activityFunctionHandler;
