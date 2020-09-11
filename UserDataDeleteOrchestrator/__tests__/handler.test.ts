// tslint:disable: no-any

import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorCancelTimer,
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
import { Day, Hour } from "italia-ts-commons/lib/units";
import { aUserDataProcessing, aProfile } from "../../__mocks__/mocks";
import { ActivityResultSuccess as DeleteUserDataActivityResultSuccess } from "../../DeleteUserDataActivity/types";
import {
  ActivityResultNotFoundFailure as GetUserDataProcessingActivityResultNotFoundFailure,
  ActivityResultSuccess as GetUserDataProcessingActivityResultSuccess
} from "../../GetUserDataProcessingActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../../SetUserDataProcessingStatusActivity/handler";
import { ActivityResultSuccess as SetUserSessionLockActivityResultSuccess } from "../../SetUserSessionLockActivity/handler";
import { OrchestratorFailure } from "../../UserDataDownloadOrchestrator/handler";
import { ProcessableUserDataDelete } from "../../UserDataProcessingTrigger";
import { ActivityResultSuccess as SendUserDataDeleteEmailActivityResultSuccess } from "../../SendUserDataDeleteEmailActivity/handler";
import { ActivityResultSuccess as GetProfileActivityResultSuccess } from "../../GetProfileActivity/handler";

const aProcessableUserDataDelete = ProcessableUserDataDelete.decode({
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DELETE,
  status: UserDataProcessingStatusEnum.PENDING
}).getOrElseL(e =>
  fail(`Failed creating a mock input document: ${readableReport(e)}`)
);

const aUserDataDownloadPending = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.PENDING
};

const aUserDataDownloadWip = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.WIP
};

const aUserDataDownloadClosed = {
  ...aUserDataProcessing,
  choice: UserDataProcessingChoiceEnum.DOWNLOAD,
  status: UserDataProcessingStatusEnum.CLOSED
};

const setUserDataProcessingStatusActivity = jest.fn().mockImplementation(() =>
  SetUserDataProcessingStatusActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const getUserDataProcessingActivity = jest.fn().mockImplementation(() =>
  GetUserDataProcessingActivityResultNotFoundFailure.encode({
    kind: "NOT_FOUND_FAILURE"
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

const sendUserDataDeleteEmailActivity = jest.fn().mockImplementation(() =>
  SendUserDataDeleteEmailActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const getProfileActivity = jest.fn().mockImplementation(() =>
  GetProfileActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: aProfile
  })
);

// A mock implementation proxy for df.callActivity/df.df.callActivityWithRetry that routes each call to the correct mock implentation
const switchMockImplementation = (name: string, ...args: readonly unknown[]) =>
  (name === "SetUserDataProcessingStatusActivity"
    ? setUserDataProcessingStatusActivity
    : name === "GetUserDataProcessingActivity"
    ? getUserDataProcessingActivity
    : name === "SetUserSessionLockActivity"
    ? setUserSessionLockActivity
    : name === "DeleteUserDataActivity"
    ? deleteUserDataActivity
    : name === "SendUserDataDeleteEmailActivity"
    ? sendUserDataDeleteEmailActivity
    : name === "GetProfileActivity"
    ? getProfileActivity
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
const context = (mockOrchestratorContext as unknown) as IOrchestrationFunctionContext;

const waitForAbortInterval = 0 as Day;
const waitForDownloadInterval = 0 as Hour;

// tslint:disable-next-line: no-big-function
describe("createUserDataDeleteOrchestratorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", () => {
    mockOrchestratorGetInput.mockReturnValueOnce("invalid input");

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(InvalidInputFailure.decode(result).isRight()).toBe(true);

    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
    expect(deleteUserDataActivity).not.toHaveBeenCalled();
    expect(setUserSessionLockActivity).not.toHaveBeenCalled();
  });

  it("should set processing ad FAILED if fails to lock the user session", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserSessionLockActivity.mockImplementationOnce(
      // tslint:disable-next-line: no-duplicate-string
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
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
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
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
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
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
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    // data has been deletes
    expect(deleteUserDataActivity).toHaveBeenCalled();
    // the email has been sent
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
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
        kind: "SUCCESS"
      })
    );
    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(OrchestratorFailure.decode(result).isRight()).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );
  });

  it("should set status as CLOSED if wait interval expires", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
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
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(OrchestratorSuccess.decode(result).isRight()).toBe(true);
    expect(mockOrchestratorCancelTimer).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.ABORTED
      })
    );
    expect(setUserSessionLockActivity).not.toHaveBeenCalled();
    expect(deleteUserDataActivity).not.toHaveBeenCalled();
  });

  it("should wait if there are pending downloads", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    // call 1: it's pending
    getUserDataProcessingActivity.mockImplementationOnce(() =>
      GetUserDataProcessingActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: aUserDataDownloadPending
      })
    );

    // call 2: it's wip
    getUserDataProcessingActivity.mockImplementationOnce(() =>
      GetUserDataProcessingActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: aUserDataDownloadWip
      })
    );

    // call 3: it's closed (so we can continue with delete)
    getUserDataProcessingActivity.mockImplementationOnce(() =>
      GetUserDataProcessingActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: aUserDataDownloadClosed
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(OrchestratorSuccess.decode(result).isRight()).toBe(true);
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(3);
  });

  it("should send a confirmation email if the operation succeeded", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        waitForDownloadInterval
      )(context)
    );

    expect(OrchestratorSuccess.decode(result).isRight()).toBe(true);
    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        toAddress: aProfile.email,
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      })
    );
  });
});
