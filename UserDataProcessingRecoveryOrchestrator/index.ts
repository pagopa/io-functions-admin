import * as df from "durable-functions";
import { handler } from "./handler";

const orchestrator = df.orchestrator(handler);

export default orchestrator;