// tslint:disable: no-any

import { IFunctionContext } from "durable-functions/lib/src/classes";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  mockCallSubOrchestrator,
  mockOrchestratorContext
} from "../../__mocks__/durable-functions";
import { aUserDataProcessing } from "../../__mocks__/mocks";
import { handler } from "../handler";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";

const aProcessableDocument = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.PENDING
};

const aNonProcessableDocumentWrongStatus = {
  ...aUserDataProcessing,
  status: UserDataProcessingStatusEnum.WIP
};

const aNonProcessableDocumentWrongChoice = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE
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
    const processableDocs: ReadonlyArray<UserDataProcessing> = [
      aProcessableDocument,
      aProcessableDocument,
      aProcessableDocument
    ];

    const input: ReadonlyArray<any> = [
      ...processableDocs,
      aNonProcessableDocumentWrongStatus,
      aNonProcessableDocumentWrongChoice
    ];

    consumeOrchestrator(handler(context, input));
    expect(mockCallSubOrchestrator).toHaveBeenCalledTimes(
      processableDocs.length
    );
  });
});
