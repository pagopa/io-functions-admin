import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { timeoutFetch } from "../utils/fetch";
import { Client, createClient } from "../utils/sessionApiClient";
import { createSetUserSessionLockActivityHandler } from "./handler";

const sessionApiUrl = getRequiredStringEnv("SESSION_API_URL");
const sessionApiKey = getRequiredStringEnv("SESSION_API_KEY");

const client: Client<"ApiKey"> = createClient({
  baseUrl: sessionApiUrl,
  fetchApi: timeoutFetch,
  withDefaults: apiOperation => ({ fiscalCode }) =>
    apiOperation({ fiscalCode, ApiKey: sessionApiKey })
});

const activityFunctionHandler = createSetUserSessionLockActivityHandler(client);

export default activityFunctionHandler;
