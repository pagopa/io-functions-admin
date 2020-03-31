/**
 * This time triggered function calls the orchestrator to update the administrations from IndicePA.
 */

import { AzureFunction, Context } from "@azure/functions";
import * as df from "durable-functions";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";

const timerTrigger: AzureFunction = async (
  context: Context,
  // tslint:disable-next-line:no-any
  myTimer: any
): Promise<void> => {
  const client = df.getClient(context);

  if (myTimer.IsPastDue) {
    context.log.info("Environment not ready yet, wait...");
  }

  const orchestratorFunctionName = "UpdateIndicePaOrchestrator";
  const instanceId = await client.startNew(
    orchestratorFunctionName,
    undefined,
    getRequiredStringEnv("INDICEPA_ADMINISTRATIONS_URL")
  );

  context.log.info(
    `UpdateIndicePaOrchestrator started with instanceId ${instanceId}`
  );
};

export default timerTrigger;
