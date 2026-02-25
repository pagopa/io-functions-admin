import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

/**
 * Checks whether the error thrown by `DurableClient.getStatus()` is a
 * 404 "instance not found" error.
 *
 * In `durable-functions` v3 the method **throws** when the Durable Task
 * extension replies with HTTP 404 (instance not found), whereas in v2 it
 * silently returned a `DurableOrchestrationStatus` object.  We detect this
 * specific error by inspecting the error message for the well-known
 * substring emitted by the library.
 */
export const isInstanceNotFoundError = (error: Error): boolean =>
  error.message?.includes("HTTP 404");

export const isOrchestratorRunning = (
  client: df.DurableClient,
  orchestratorId: string
): TE.TaskEither<
  Error,
  DurableOrchestrationStatus & {
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
    })),
    // In durable-functions v3, getStatus throws on 404 (instance not found).
    // We treat this as "orchestrator not running" to preserve the v2 semantic
    // behaviour expected by callers (e.g. startOrchestrator).
    TE.orElse(error =>
      isInstanceNotFoundError(error)
        ? TE.of({
            createdTime: new Date(0),
            input: null,
            instanceId: orchestratorId,
            isRunning: false as const,
            lastUpdatedTime: new Date(0),
            name: orchestratorId,
            output: null,
            runtimeStatus: "Unknown" as unknown as df.OrchestrationRuntimeStatus
          } as DurableOrchestrationStatus & { readonly isRunning: false })
        : TE.left(error)
    )
  );
