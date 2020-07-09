import * as df from "durable-functions";
import { IFunctionContext } from "durable-functions/lib/src/classes";
import { Hour, Millisecond } from "italia-ts-commons/lib/units";
import { getHandler } from "./handler";

const delayInHours = (typeof process.env.USER_DATA_DOWNLOAD_DELAY_HOURS ===
"undefined"
  ? 24
  : process.env.USER_DATA_DOWNLOAD_DELAY_HOURS) as Hour;
const delay = (delayInHours * 60 * 60 * 1000) as Millisecond;

const handler = getHandler(delay);

const orchestrator = df.orchestrator(handler);

export default orchestrator;
