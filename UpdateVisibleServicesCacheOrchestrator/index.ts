/*
 * Calls an activity function for each visible service
 * found into the stored JSON. The activity function will store
 * one JSON into the blob storage for each visible service found.
 */

import {
  IOrchestrationFunctionContext,
  Task
} from "durable-functions/lib/src/classes";

import * as df from "durable-functions";
import { isLeft } from "fp-ts/lib/Either";
import { VisibleServices } from "../UpdateVisibleServicesCache";

// eslint-disable-next-line @typescript-eslint/naming-convention
const UpdateVisibleServicesCacheOrchestrator = df.orchestrator(function*(
  context: IOrchestrationFunctionContext
): Generator<Task> {
  const visibleServicesJson = context.df.getInput();
  const errorOrVisibleServices = VisibleServices.decode(visibleServicesJson);

  if (isLeft(errorOrVisibleServices)) {
    context.log.error(
      "UpdateVisibleServicesCacheOrchestrator|Error decoding visible services JSON."
    );
    return;
  }
  const visibleServices = errorOrVisibleServices.value;

  for (const visibleServiceId of Object.keys(visibleServices)) {
    yield context.df.callActivity(
      "UpdateVisibleServicesCacheActivity",
      visibleServices[visibleServiceId]
    );
  }
});

export default UpdateVisibleServicesCacheOrchestrator;
