import * as df from "durable-functions";
import { createUserDataDeleteOrchestratorHandler } from "./handler";

const orchestrator = df.orchestrator(createUserDataDeleteOrchestratorHandler);

export default orchestrator;
