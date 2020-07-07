// tslint:disable: no-any

import { IFunctionContext } from "durable-functions/lib/src/classes";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  mockCallSubOrchestrator,
  mockOrchestratorContext
} from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";
import { handler } from "../handler";

const aProcessableDocument = {
  ...aUserDataProcessing,
  status: UserDataProcessingStatusEnum.PENDING
};

const aNonProcessableDocument = {
  ...aUserDataProcessing,
  status: UserDataProcessingStatusEnum.WIP
};

/**
 * Util function that takes an orchestrator and executes each step until is done
 * @param orch an orchestrator
 *
 * @returns the last value yielded by the orchestrator
 */
const consumeOrchestrator = (orch: any) => {
  // tslint:disable-next-line: no-let
  let prevValue: unknown;
  while (true) {
    const { done, value } = orch.next(prevValue);
    if (done) {
      return value;
    }
    prevValue = value;
  }
};

// just a convenient cast, good for every test case
const context = (mockOrchestratorContext as unknown) as IFunctionContext;

describe("handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", () => {
    const input = "invalid";

    try {
      consumeOrchestrator(handler(context, input));
      fail("it should throw");
    } catch (error) {
      expect(mockCallSubOrchestrator).not.toHaveBeenCalled();
    }
  });

  it("should process every processable document", () => {
    const input: ReadonlyArray<any> = [
      aProcessableDocument,
      aProcessableDocument,
      aProcessableDocument,
      aNonProcessableDocument,
      aNonProcessableDocument
    ];

    consumeOrchestrator(handler(context, input));
    expect(mockCallSubOrchestrator).toHaveBeenCalledTimes(3);
  });
});
