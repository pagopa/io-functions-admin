/**
 * Mock implementation of the zip module
 */

export const createCompressedStream = jest.fn(() => ({
  pipe: jest.fn()
}));
