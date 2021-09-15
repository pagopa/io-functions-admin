import { context as contextMock } from "../../__mocks__/functions";
import { aFiscalCode, aUserDataProcessing } from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultSuccess,
  getFindFailureReasonActivityHandler
} from "../handler";

import * as E from "fp-ts/lib/Either";
import { UserDataProcessingModel } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/durableorchestrationstatus";

const aChoice = aUserDataProcessing.choice;
const failedOrchestratorOutput =
  "This is the output of the failed orchestrator that should give a failure reason";

const getOrchestratorStatusMock = jest.fn(
  async (orchestratorId: string) =>
    ({
      name: orchestratorId,
      instanceId: orchestratorId,
      createdTime: new Date(),
      lastUpdatedTime: new Date(),
      input: null,
      output: failedOrchestratorOutput,
      runtimeStatus: "Completed"
    } as DurableOrchestrationStatus)
);

jest.mock("durable-functions", () => ({
  OrchestrationRuntimeStatus: {
    Running: "Running"
  },
  getClient: (context: any) => ({
    getStatus: getOrchestratorStatusMock
  })
}));

describe("UserDataProcessingFindFailureReasonActivity", () => {
  it("should handle a result", async () => {
    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await getFindFailureReasonActivityHandler(
      contextMock,
      input
    );

    const decodedResult = ActivityResultSuccess.decode(result);
    expect(E.isRight(decodedResult)).toBe(true);
    if (E.isRight(decodedResult)) {
      expect(decodedResult.right).toEqual({
        kind: "SUCCESS",
        value: JSON.stringify(failedOrchestratorOutput, (key, value) => value)
      });
    }
  });

  it("should handle a record not found failure", async () => {
    getOrchestratorStatusMock.mockImplementationOnce(
      async (orchestratorId: string) => {
        throw "Not found";
      }
    );

    const input: ActivityInput = {
      choice: aChoice,
      fiscalCode: aFiscalCode
    };
    const result = await getFindFailureReasonActivityHandler(
      contextMock,
      input
    );

    expect(E.isRight(ActivityResultNotFoundFailure.decode(result))).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    // @ts-ignore to force bad behavior
    const result = await getFindFailureReasonActivityHandler(contextMock, {
      invalid: "input"
    });

    expect(E.isRight(ActivityResultInvalidInputFailure.decode(result))).toBe(
      true
    );
  });
});
