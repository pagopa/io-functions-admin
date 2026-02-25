import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions";
import * as E from "fp-ts/lib/Either";
import { describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import {
  makeGetStatus404Error,
  OrchestrationRuntimeStatus
} from "../../__mocks__/durable-functions";
import {
  isInstanceNotFoundError,
  isOrchestratorRunning
} from "../orchestrator";

const orchestratorId = "test-orchestrator-id";

const makeMockClient = (
  getStatusImpl: (id: string) => Promise<DurableOrchestrationStatus>
) =>
  ({
    getStatus: vi.fn(getStatusImpl)
  }) as unknown as df.DurableClient;

const aRunningStatus = {
  createdTime: new Date(),
  input: null,
  instanceId: orchestratorId,
  lastUpdatedTime: new Date(),
  name: orchestratorId,
  output: null,
  runtimeStatus: OrchestrationRuntimeStatus.Running
} as DurableOrchestrationStatus;

const aCompletedStatus = {
  createdTime: new Date(),
  input: null,
  instanceId: orchestratorId,
  lastUpdatedTime: new Date(),
  name: orchestratorId,
  output: null,
  runtimeStatus: OrchestrationRuntimeStatus.Completed
} as DurableOrchestrationStatus;

describe("isInstanceNotFoundError", () => {
  it("should return true for a v3 404 error message", () => {
    const error = makeGetStatus404Error(orchestratorId);
    expect(isInstanceNotFoundError(error)).toBe(true);
  });

  it("should return false for a generic error", () => {
    const error = new Error("Something went wrong");
    expect(isInstanceNotFoundError(error)).toBe(false);
  });

  it("should return false for an error with empty message", () => {
    const error = new Error();
    expect(isInstanceNotFoundError(error)).toBe(false);
  });
});

describe("isOrchestratorRunning", () => {
  it("should return isRunning=true when orchestrator is Running", async () => {
    const client = makeMockClient(async () => aRunningStatus);

    const result = await isOrchestratorRunning(client, orchestratorId)();

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.isRunning).toBe(true);
      expect(result.right.runtimeStatus).toBe(
        OrchestrationRuntimeStatus.Running
      );
    }
  });

  it("should return isRunning=true when orchestrator is Pending", async () => {
    const pendingStatus = {
      ...aRunningStatus,
      runtimeStatus: OrchestrationRuntimeStatus.Pending
    } as DurableOrchestrationStatus;
    const client = makeMockClient(async () => pendingStatus);

    const result = await isOrchestratorRunning(client, orchestratorId)();

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.isRunning).toBe(true);
    }
  });

  it("should return isRunning=false when orchestrator is Completed", async () => {
    const client = makeMockClient(async () => aCompletedStatus);

    const result = await isOrchestratorRunning(client, orchestratorId)();

    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.isRunning).toBe(false);
    }
  });

  it("should return isRunning=false when getStatus throws a 404 error (v3 behavior)", async () => {
    const client = makeMockClient(async () => {
      throw makeGetStatus404Error(orchestratorId);
    });

    const result = await isOrchestratorRunning(client, orchestratorId)();

    // Should be Right, not Left — 404 is treated as "not running"
    expect(E.isRight(result)).toBe(true);
    if (E.isRight(result)) {
      expect(result.right.isRunning).toBe(false);
    }
  });

  it("should return Left(Error) when getStatus throws a non-404 error", async () => {
    const genericError = new Error("Connection refused");
    const client = makeMockClient(async () => {
      throw genericError;
    });

    const result = await isOrchestratorRunning(client, orchestratorId)();

    expect(E.isLeft(result)).toBe(true);
    if (E.isLeft(result)) {
      expect(result.left.message).toBe("Connection refused");
    }
  });
});
