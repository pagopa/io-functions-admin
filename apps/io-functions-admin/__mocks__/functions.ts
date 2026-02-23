import { InvocationContext } from "@azure/functions";
import { vi } from "vitest";

export const context = {
  debug: vi.fn().mockImplementation(console.log),

  error: vi.fn().mockImplementation(console.log),

  extraInputs: {
    get: vi.fn()
  },

  log: vi.fn().mockImplementation(console.log),

  warn: vi.fn().mockImplementation(console.log)
} as unknown as InvocationContext;
