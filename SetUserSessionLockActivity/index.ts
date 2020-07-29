import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { timeoutFetch } from "../utils/fetch";
import {
  ApiOperation,
  Client,
  createClient,
  WithDefaultsT
} from "../utils/sessionApiClient";
import { createSetUserSessionLockActivityHandler } from "./handler";

const sessionApiUrl = getRequiredStringEnv("SESSION_API_URL");
const sessionApiKey = getRequiredStringEnv("SESSION_API_KEY");

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
