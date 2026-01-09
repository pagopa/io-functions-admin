import { vi } from "vitest";

export const defaultClient = {
  trackEvent: vi.fn(),
  trackException: vi.fn()
};
