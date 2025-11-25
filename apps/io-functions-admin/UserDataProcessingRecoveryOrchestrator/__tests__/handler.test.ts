/* eslint-disable vitest/prefer-called-with */
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import * as E from "fp-ts/lib/Either";
import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line vitest/no-mocks-import
import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorContext,
  mockOrchestratorGetInput
} from "../../__mocks__/durable-functions";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../../SetUserDataProcessingStatusActivity/handler";
import { ActivityResultSuccess as CheckLastStatusActivityResultSuccess } from "../../UserDataProcessingCheckLastStatusActivity/handler";
import { ActivityResultSuccess as FindFailureReasonActivityResultSuccess } from "../../UserDataProcessingFindFailureReasonActivity/handler";
import {
  handler,
  InvalidInputFailure,
  OrchestratorFailure,
  OrchestratorSuccess,
  SkippedDocument
} from "../handler";

const checkLastStatusActivity = vi.fn().mockImplementation(() =>
  CheckLastStatusActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: UserDataProcessingStatusEnum.FAILED
  })
);

const findFailureReasonActivity = vi.fn().mockImplementation(() =>
  FindFailureReasonActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: "Any found reason" as NonEmptyString
  })
);
const setUserDataProcessingStatusActivity = vi.fn().mockImplementation(() =>
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
        : vi.fn())(name, ...args);

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
  let prevValue: unknown;
  while (true) {
    const { done, value } = orch.next(prevValue);
    if (done) {
      return value;
    }
    prevValue = value;
  }
};

const context =
  mockOrchestratorContext as unknown as IOrchestrationFunctionContext;
const choice = "DELETE" as UserDataProcessingChoice;
const fiscalCode = "DQFCOC07A82Y456X" as FiscalCode;

beforeEach(() => {
  vi.clearAllMocks();
});

// eslint-disable-next-line max-lines-per-function
describe("UserDataProcessingRecoveryOrchestrator", () => {
  it("should fail on invalid input", () => {
    const document = "invalid";
    mockOrchestratorGetInput.mockReturnValueOnce(document);
    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);
    expect(checkLastStatusActivity).not.toHaveBeenCalled();
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail on not failed record", () => {
    const aNotFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "CLOSED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aNotFailedUserDataProcessing);
    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);
    expect(checkLastStatusActivity).not.toHaveBeenCalled();
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when checkLastStatusActivity throws exception", () => {
    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    checkLastStatusActivity.mockImplementationOnce(() => {
      throw "any error";
    });

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);
    expect(E.isRight(orchestratorResult)).toBe(true);
    if (E.isRight(orchestratorResult)) {
      expect(orchestratorResult.right).toEqual({
        kind: "UNHANDLED",
        reason: "any error"
      });
    }

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).not.toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when findFailureReasonActivity throws exception", () => {
    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    findFailureReasonActivity.mockImplementationOnce(() => {
      throw "any error";
    });

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);

    expect(E.isRight(orchestratorResult)).toBe(true);
    if (E.isRight(orchestratorResult)) {
      expect(orchestratorResult.right).toEqual({
        kind: "UNHANDLED",
        reason: "any error"
      });
    }

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
  });

  it("should fail when setUserDataProcessingStatusActivity throws exception", () => {
    const aFailedUserDataProcessing = {
      choice: choice,
      createdAt: "2020-10-02T15:12:36.006Z",
      fiscalCode: fiscalCode,
      status: "FAILED",
      userDataProcessingId: "DQFCOC07A82Y456X-DELETE"
    };
    mockOrchestratorGetInput.mockReturnValueOnce(aFailedUserDataProcessing);

    setUserDataProcessingStatusActivity.mockImplementationOnce(() => {
      throw "any error";
    });

    const result = consumeOrchestrator(handler(context));

    const orchestratorResult = OrchestratorFailure.decode(result);
    expect(E.isRight(orchestratorResult)).toBe(true);
    if (E.isRight(orchestratorResult)) {
      expect(orchestratorResult.right).toEqual({
        kind: "UNHANDLED",
        reason: "any error"
      });
    }

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(findFailureReasonActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
  });

  it("should SKIP when valid input is given but last status is not failed", () => {
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
    expect(E.isRight(orchestratorResult)).toBe(true);
    if (E.isRight(orchestratorResult)) {
      expect(orchestratorResult.right).toEqual({
        kind: "SKIPPED"
      });
    }

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
    expect(E.isRight(orchestratorResult)).toBe(true);
    if (E.isRight(orchestratorResult)) {
      expect(orchestratorResult.right).toEqual({
        kind: "SUCCESS",
        type: "COMPLETED"
      });
    }

    expect(checkLastStatusActivity).toHaveBeenCalled();
    expect(checkLastStatusActivity).toHaveBeenCalledTimes(1);
    expect(checkLastStatusActivity).toHaveBeenCalledWith(
      "UserDataProcessingCheckLastStatusActivity",
      {
        choice: choice,
        fiscalCode: fiscalCode
      }
    );

    const expectedRetryOptions = expect.any(Object);

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
      expectedRetryOptions,
      {
        currentRecord: aFailedUserDataProcessing,
        failureReason: "Any found reason",
        nextStatus: UserDataProcessingStatusEnum.FAILED
      }
    );
  });
});
