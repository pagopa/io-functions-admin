export const mockStartNew = jest.fn();

export const getClient = jest.fn(() => ({
  startNew: mockStartNew
}));

export const orchestrator = jest.fn();

export const RetryOptions = jest.fn(() => ({}));
