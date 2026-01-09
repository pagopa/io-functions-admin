/**
 * Temporary Activity to allow the orchestrator execution queue cleanup.
 * This Activity will be removed again when the durable functions
 * runtime complete all the pending orchestrations into the taskhub.
 */

import { getUpdateVisibleServicesActivityHandler } from "./handler";

const activityFunctionHandler = getUpdateVisibleServicesActivityHandler();

export default activityFunctionHandler;
