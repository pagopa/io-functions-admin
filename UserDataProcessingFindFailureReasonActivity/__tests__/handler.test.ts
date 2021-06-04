import { right } from "fp-ts/lib/Either";
import { context as contextMock } from "../../__mocks__/functions";
import {
  aFiscalCode,
  aUserDataProcessing,
  aUserDataProcessingStatus
} from "../../__mocks__/mocks";

import {
  ActivityInput,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultQueryFailure,
  ActivityResultSuccess,
  getFindFailureReasonActivityHandler
} from "../handler";

import { none, some } from "fp-ts/lib/Option";
import { fromEither, fromLeft } from "fp-ts/lib/TaskEither";
import { UserDataProcessingModel } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
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
    expect(decodedResult.isRight()).toBe(true);
    expect(decodedResult.value).toEqual({
      kind: "SUCCESS",
      value: JSON.stringify(failedOrchestratorOutput, (key, value) => value)
    });
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

    expect(ActivityResultNotFoundFailure.decode(result).isRight()).toBe(true);
  });

  it("should handle an invalid input", async () => {
    const mockModel = ({} as any) as UserDataProcessingModel;

    // @ts-ignore to force bad behavior
    const result = await getFindFailureReasonActivityHandler(contextMock, {
      invalid: "input"
    });

    expect(ActivityResultInvalidInputFailure.decode(result).isRight()).toBe(
      true
    );
  });
});
