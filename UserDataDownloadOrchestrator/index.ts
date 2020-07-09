import * as df from "durable-functions";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { Millisecond } from "italia-ts-commons/lib/units";
import { getHandler } from "./handler";

const delayInHours = NonNegativeInteger.decode(
  process.env.USER_DATA_DOWNLOAD_DELAY_HOURS
).getOrElse(24 as NonNegativeInteger);
const delay = (delayInHours * 60 * 60 * 1000) as Millisecond;

const handler = getHandler(delay);

const orchestrator = df.orchestrator(handler);

export default orchestrator;
