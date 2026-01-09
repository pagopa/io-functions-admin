import { Context } from "@azure/functions";
import { vi } from "vitest";

export const context = {
  bindings: {},
  log: {
    error: vi.fn().mockImplementation(console.log),

    info: vi.fn().mockImplementation(console.log),

    verbose: vi.fn().mockImplementation(console.log),

    warn: vi.fn().mockImplementation(console.log)
  }
} as unknown as Context;
