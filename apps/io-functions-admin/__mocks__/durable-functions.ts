// eslint-disable @typescript-eslint/no-explicit-any

import { Context } from "@azure/functions";
import { vi } from "vitest";

export const OrchestrationRuntimeStatus = {
  Running: "Running",
  Completed: "Completed",
  ContinuedAsNew: "ContinuedAsNew",
  Failed: "Failed",
  Canceled: "Canceled",
  Terminated: "Terminated",
  Pending: "Pending"
};

export const mockStatusRunning = {
  runtimeStatus: OrchestrationRuntimeStatus.Running
};
export const mockStatusCompleted = {
  runtimeStatus: OrchestrationRuntimeStatus.Completed
};

export const mockStartNew = vi.fn((_, __, ___) =>
  Promise.resolve("instanceId")
);
export const mockGetStatus = vi
  .fn()
  .mockImplementation(async () => mockStatusCompleted);
export const mockTerminate = vi.fn(async (_, __) => {
  return;
});

export const mockRaiseEvent = vi.fn().mockImplementation(async () => void 0);

export const getClient = vi.fn().mockImplementation(() => ({
  getStatus: mockGetStatus,
  raiseEvent: mockRaiseEvent,
  startNew: mockStartNew,
  terminate: mockTerminate
}));

export const RetryOptions = vi.fn(() => ({}));

export const context = ({
  bindings: {
    orchestrationClient: {}
  },
  log: {
    error: vi.fn().mockImplementation(console.log),

    info: vi.fn().mockImplementation(console.log),

    verbose: vi.fn().mockImplementation(console.log),

    warn: vi.fn().mockImplementation(console.log)
  }
} as any) as Context;

//
// Orchestrator context
//

export const mockOrchestratorGetInput = vi.fn();
export const mockOrchestratorCallActivity = vi
  .fn()
  .mockImplementation((name: string, input?: unknown) => ({
    input,
    name
  }));
export const mockOrchestratorCallActivityWithRetry = vi
  .fn()
  .mockImplementation((name: string, retryOptions: any, input?: unknown) => ({
    input,
    name,
    retryOptions
  }));
export const mockCallSubOrchestrator = vi
  .fn()
  .mockImplementation((name: string, input?: unknown) => ({
    input,
    name
  }));
export const mockOrchestratorSetCustomStatus = vi.fn();
export const mockOrchestratorCancelTimer = vi.fn();
export const mockOrchestratorCreateTimer = vi.fn().mockImplementation(() => ({
  cancel: mockOrchestratorCancelTimer
}));
export const mockWaitForExternalEvent = vi
  .fn()
  .mockReturnValue("mockWaitForExternalEvent");

export const mockOrchestratorTaskAny = vi
  .fn()
  // mock implementation: return the first task
  .mockImplementation(([_]) => _);

export const mockOrchestratorContext = {
  ...context,
  df: {
    callActivity: mockOrchestratorCallActivity,
    callActivityWithRetry: mockOrchestratorCallActivityWithRetry,
    callSubOrchestrator: mockCallSubOrchestrator,
    createTimer: mockOrchestratorCreateTimer,
    currentUtcDateTime: new Date(),
    getClient,
    getInput: mockOrchestratorGetInput,
    setCustomStatus: mockOrchestratorSetCustomStatus,
    Task: {
      all: vi.fn(),
      any: mockOrchestratorTaskAny
    },
    waitForExternalEvent: mockWaitForExternalEvent
  }
};

export const orchestrator = vi
  .fn()
  .mockImplementation((fn) => () => fn(mockOrchestratorContext));
