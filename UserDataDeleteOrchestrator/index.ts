import * as df from "durable-functions";
import { Day } from "@pagopa/ts-commons/lib/units";
import { getConfigOrThrow } from "../utils/config";
import { createUserDataDeleteOrchestratorHandler } from "./handler";

const config = getConfigOrThrow();

const waitInterval = (config.USER_DATA_DELETE_DELAY_DAYS as unknown) as Day;

const orchestrator = df.orchestrator(
  createUserDataDeleteOrchestratorHandler(waitInterval)
);

export default orchestrator;
