import { Context } from "@azure/functions";

export const context = ({
    bindings: {},
    log: {
      // eslint-disable-next-line no-console
      error: jest.fn().mockImplementation(console.log),
      // eslint-disable-next-line no-console
      info: jest.fn().mockImplementation(console.log),
      // eslint-disable-next-line no-console
      verbose: jest.fn().mockImplementation(console.log),
      // eslint-disable-next-line no-console
      warn: jest.fn().mockImplementation(console.log)
    }
  } as unknown) as Context;
  