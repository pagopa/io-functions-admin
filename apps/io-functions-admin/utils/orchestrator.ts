import { PromiseType } from "@pagopa/ts-commons/lib/types";
import * as df from "durable-functions";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

export const isOrchestratorRunning = (
  client: DurableOrchestrationClient,
  orchestratorId: string
): TE.TaskEither<
  Error,
  PromiseType<ReturnType<typeof client["getStatus"]>> & {
    readonly isRunning: boolean;
  }
> =>
  pipe(
    TE.tryCatch(() => client.getStatus(orchestratorId), toError),
    TE.map(status => ({
      ...status,
      isRunning:
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending
    }))
  );
