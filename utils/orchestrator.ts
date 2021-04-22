import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import { toError } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { PromiseType } from "@pagopa/ts-commons/lib/types";

export const isOrchestratorRunning = (
  client: DurableOrchestrationClient,
  orchestratorId: string
): TaskEither<
  Error,
  PromiseType<ReturnType<typeof client["getStatus"]>> & {
    readonly isRunning: boolean;
  }
> =>
  tryCatch(() => client.getStatus(orchestratorId), toError).map(status => ({
    ...status,
    isRunning:
      status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
      status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending
  }));
