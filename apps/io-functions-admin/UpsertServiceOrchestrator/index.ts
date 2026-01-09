/**
 * Temporary Orchestrator to allow the orchestrator execution queue cleanup.
 * This Orchestrator will be removed again when the durable functions
 * runtime complete all the pending orchestrations into the taskhub.
 */

import * as df from "durable-functions";

import { handler } from "./handler";

const orchestrator = df.orchestrator(handler);

export default orchestrator;
