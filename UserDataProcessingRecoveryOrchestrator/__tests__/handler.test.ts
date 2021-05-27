import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorContext,
  mockOrchestratorGetInput
} from "../../__mocks__/durable-functions";
import {
  ActivityInput as CheckLastStatusActivityInput,
  ActivityResultSuccess as CheckLastStatusActivityResultSuccess
} from "../../UserDataProcessingCheckLastStatusActivity/handler";
import {
  ActivityInput as FindFailureReasonActivityInput,
  ActivityResultSuccess as FindFailureReasonActivityResultSuccess
} from "../../UserDataProcessingFindFailureReasonActivity/handler";
import {
  ActivityInput as SetUserDataProcessingStatusActivityInput,
  ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess
} from "../../SetUserDataProcessingStatusActivity/handler";
import {
  ActivityFailure,
  handler,
  InvalidInputFailure,
  OrchestratorFailure,
  OrchestratorSuccess,
  SkippedDocument
} from "../handler";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";

const checkLastStatusActivity = jest.fn().mockImplementation(() =>
  CheckLastStatusActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: UserDataProcessingStatusEnum.FAILED
  })
);

const findFailureReasonActivity = jest.fn().mockImplementation(() =>
  FindFailureReasonActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: "Any found reason" as NonEmptyString
  })
);
const setUserDataProcessingStatusActivity = jest.fn().mockImplementation(() =>
  SetUserDataProcessingStatusActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

// A mock implementation proxy for df.callActivity/df.df.callActivityWithRetry that routes each call to the correct mock implentation
const switchMockImplementation = (name: string, ...args: readonly unknown[]) =>
  (name === "UserDataProcessingCheckLastStatusActivity"
    ? checkLastStatusActivity
    : name === "UserDataProcessingFindFailureReasonActivity"
    ? findFailureReasonActivity
    : name === "SetUserDataProcessingStatusActivity"
    ? setUserDataProcessingStatusActivity
    : jest.fn())(name, ...args);

// I assign switchMockImplementation to both because
// I don't want tests to depend on implementation details
// such as which activity is called with retry and which is not
mockOrchestratorCallActivity.mockImplementation(switchMockImplementation);
mockOrchestratorCallActivityWithRetry.mockImplementation(
  switchMockImplementation
);

/**
 * Util function that takes an orchestrator and executes each step until is done
 * @param orch an orchestrator
 *
 * @returns the last value yielded by the orchestrator
 */
const consumeOrchestrator = (orch: any) => {
  // eslint-disable-next-line functional/no-let
  let prevValue: unknown;
  while (true) {
    const { done, value } = orch.next(prevValue);
    if (done) {
      return value;
    }
    prevValue = value;
  }
};

const context = (mockOrchestratorContext as unknown) as IOrchestrationFunctionContext;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("UserDataProcessingRecoveryOrchestrator", () => {
  it("should fail on invalid input", () => {
    const document = "invalid";
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(InvalidInputFailure.decode(result).isRight()).toBe(true);
    expect(checkLastStatusActivity).not.toHaveBeenCalled();
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when checkLastStatusActivity throws exception", () => {
    const choice = "DELETE" as UserDataProcessingChoice;
    const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    checkLastStatusActivity.mockImplementationOnce(
      // eslint-disable-next-line sonarjs/no-duplicate-string
      () => {
        throw "any error";
      }
    );

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);
    expect(orchestratorResult.isRight()).toBe(true);
    expect(orchestratorResult.value).toEqual({
      kind: "UNHANDLED",
      reason: '"any error"'
    });
    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when findFailureReasonActivity throws exception", () => {
    const choice = "DELETE" as UserDataProcessingChoice;
    const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    findFailureReasonActivity.mockImplementationOnce(
      // eslint-disable-next-line sonarjs/no-duplicate-string
      () => {
        throw "any error";
      }
    );

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);
    expect(orchestratorResult.isRight()).toBe(true);
    expect(orchestratorResult.value).toEqual({
      kind: "UNHANDLED",
      reason: '"any error"'
    });
    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when setUserDataProcessingStatusActivity throws exception", () => {
    const choice = "DELETE" as UserDataProcessingChoice;
    const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    setUserDataProcessingStatusActivity.mockImplementationOnce(
      // eslint-disable-next-line sonarjs/no-duplicate-string
      () => {
        throw "any error";
      }
    );

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);
    expect(orchestratorResult.isRight()).toBe(true);
    expect(orchestratorResult.value).toEqual({
      kind: "UNHANDLED",
      reason: '"any error"'
    });
    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
  });

  it("should SKIP when valid input is given but last status is not failed", () => {
    const choice = "DELETE" as UserDataProcessingChoice;
    const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    checkLastStatusActivity.mockReturnValueOnce(
      CheckLastStatusActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: UserDataProcessingStatusEnum.CLOSED
      })
    );

    const result = consumeOrchestrator(handler(context));
    const orchestratorResult = SkippedDocument.decode(result);
    expect(orchestratorResult.isRight()).toBe(true);
    expect(orchestratorResult.value).toEqual({
      kind: "SKIPPED"
    });

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(checkLastStatusActivity).toHaveBeenCalledTimes(1);
    expect(checkLastStatusActivity).toHaveBeenCalledWith(
      "UserDataProcessingCheckLastStatusActivity",
      {
        choice: choice,
        fiscalCode: fiscalCode
      }
    );
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should set processing status as FAILED with a reason when valid input is given", () => {
    const choice = "DELETE" as UserDataProcessingChoice;
    const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorSuccess.decode(result);
    expect(orchestratorResult.isRight()).toBe(true);
    expect(orchestratorResult.value).toEqual({
      kind: "SUCCESS",
      type: "COMPLETED"
    });

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(checkLastStatusActivity).toHaveBeenCalledTimes(1);
    expect(checkLastStatusActivity).toHaveBeenCalledWith(
      "UserDataProcessingCheckLastStatusActivity",
      {
        choice: choice,
        fiscalCode: fiscalCode
      }
    );

    expect(findFailureReasonActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).toHaveBeenCalledTimes(1);
    expect(findFailureReasonActivity).toHaveBeenCalledWith(
      "UserDataProcessingFindFailureReasonActivity",
      {
        choice: choice,
        fiscalCode: fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      "SetUserDataProcessingStatusActivity",
      {
        currentRecord: aFailedUserDataProcessing,
        failureReason: "Any found reason",
        nextStatus: UserDataProcessingStatusEnum.FAILED
      }
    );
  });
});
