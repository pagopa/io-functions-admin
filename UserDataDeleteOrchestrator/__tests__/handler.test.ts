// tslint:disable: no-any

import { IFunctionContext } from "durable-functions/lib/src/classes";
import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorContext,
  mockOrchestratorGetInput,
  mockOrchestratorTaskAny
} from "../../__mocks__/durable-functions";
import {
  createUserDataDeleteOrchestratorHandler,
  InvalidInputFailure,
  OrchestratorSuccess
} from "../handler";

import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { aUserDataProcessing } from "../../__mocks__/mocks";
import { ActivityResultSuccess as DeleteUserDataActivityResultSuccess } from "../../DeleteUserDataActivity/types";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../../SetUserDataProcessingStatusActivity/handler";
import { ActivityResultSuccess as SetUserSessionLockActivityResultSuccess } from "../../SetUserSessionLockActivity/handler";
import { OrchestratorFailure } from "../../UserDataDownloadOrchestrator/handler";
import { ProcessableUserDataDelete } from "../../UserDataProcessingTrigger";
import { Day } from "italia-ts-commons/lib/units";

const aProcessableUserDataDelete = ProcessableUserDataDelete.decode({
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE,
  status: UserDataProcessingStatusEnum.PENDING
}).getOrElseL(e =>
  fail(`Failed creating a mock input document: ${readableReport(e)}`)
);

const setUserDataProcessingStatusActivity = jest.fn().mockImplementation(() =>
  SetUserDataProcessingStatusActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: aProcessableUserDataDelete
  })
);

const setUserSessionLockActivity = jest.fn().mockImplementation(() =>
  SetUserSessionLockActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const deleteUserDataActivity = jest.fn().mockImplementation(() =>
  DeleteUserDataActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

// A mock implementation proxy for df.callActivity/df.df.callActivityWithRetry that routes each call to the correct mock implentation
const switchMockImplementation = (name: string, ...args: readonly unknown[]) =>
  (name === "SetUserDataProcessingStatusActivity"
    ? setUserDataProcessingStatusActivity
    : name === "SetUserSessionLockActivity"
    ? setUserSessionLockActivity
    : name === "DeleteUserDataActivity"
    ? deleteUserDataActivity
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

const waitInterval = 0 as Day;

describe("createUserDataDeleteOrchestratorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", () => {
    mockOrchestratorGetInput.mockReturnValueOnce("invalid input");

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(InvalidInputFailure.decode(result).isRight()).toBe(true);

    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
    expect(deleteUserDataActivity).not.toHaveBeenCalled();
    expect(setUserSessionLockActivity).not.toHaveBeenCalled();
  });

  it("should set processing ad FAILED if fails to lock the user session", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserSessionLockActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set processing ad FAILED if fails to set the operation as WIP", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set processing ad FAILED if fails delete user data", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    deleteUserDataActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set processing ad FAILED if fails to unlock the user session", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserSessionLockActivity.mockImplementationOnce(() =>
      SetUserSessionLockActivityResultSuccess.encode({
        kind: "SUCCESS"
      })
    );
    setUserSessionLockActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set processing ad FAILED if fails to set the operation as WIP", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserDataProcessingStatusActivity.mockImplementationOnce(() =>
      SetUserDataProcessingStatusActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: aProcessableUserDataDelete
      })
    );
    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set status as CLOSED if wait interval expired", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorSuccess.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: "LOCK"
      })
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: "UNLOCK"
      })
    );
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);
  });

  it("should set status as CLOSED if abort request comes before wait interval expires", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    // I trick the implementation of Task.any to return the second event, not the first
    mockOrchestratorTaskAny.mockImplementationOnce(([, _]) => _);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(waitInterval)(context)
    );

    expect(OrchestratorSuccess.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.ABORTED
      })
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: "LOCK"
      })
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        action: "UNLOCK"
      })
    );
    expect(deleteUserDataActivity).not.toHaveBeenCalled();
  });
});
