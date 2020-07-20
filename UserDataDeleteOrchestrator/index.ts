import * as df from "durable-functions";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { Day } from "italia-ts-commons/lib/units";
import { createUserDataDeleteOrchestratorHandler } from "./handler";

const waitInterval = (getRequiredStringEnv(
  "USER_DATA_DELETE_DELAY_DAYS"
) as unknown) as Day;

const orchestrator = df.orchestrator(
  createUserDataDeleteOrchestratorHandler(waitInterval)
);

export default orchestrator;
