/* eslint-disable vitest/prefer-called-with */
import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { Day, Hour } from "@pagopa/ts-commons/lib/units";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorCancelTimer,
  mockOrchestratorContext,
  mockOrchestratorGetInput,
  mockOrchestratorTaskAny
} from "../../__mocks__/durable-functions";
import {
  aProfile,
  aRetrievedProfile,
  aRetrievedServicePreferences,
  aUserDataProcessing
} from "../../__mocks__/mocks";
import { ActivityResultSuccess as DeleteUserDataActivityResultSuccess } from "../../DeleteUserDataActivity/types";
import {
  ActivityResultNotFoundFailure as GetProfileActivityResultNotFoundFailure,
  ActivityResultSuccess as GetProfileActivityResultSuccess
} from "../../GetProfileActivity/handler";
import { ActivityResultSuccess as GetServicesPreferencesActivityResultSuccess } from "../../GetServicesPreferencesActivity/handler";
import {
  ActivityResultNotFoundFailure as GetUserDataProcessingActivityResultNotFoundFailure,
  ActivityResultSuccess as GetUserDataProcessingActivityResultSuccess
} from "../../GetUserDataProcessingActivity/handler";
import {
  ActivityResultFailure as IsFailedUserDataProcessingActivityResultFailure,
  ActivityResultSuccess as IsFailedUserDataProcessingActivityResultSuccess
} from "../../IsFailedUserDataProcessingActivity/handler";
import { ActivityResultSuccess as SendUserDataDeleteEmailActivityResultSuccess } from "../../SendUserDataDeleteEmailActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../../SetUserDataProcessingStatusActivity/handler";
import { ActivityResultSuccess as SetUserSessionLockActivityResultSuccess } from "../../SetUserSessionLockActivity/handler";
import { OrchestratorFailure } from "../../UserDataDownloadOrchestrator/handler";
import { ProcessableUserDataDelete } from "../../UserDataProcessingTrigger/handler";
import {
  createUserDataDeleteOrchestratorHandler,
  InvalidInputFailure,
  OrchestratorSuccess
} from "../handler";
import { addDays, addHours } from "../utils";

const aProcessableUserDataDelete = pipe(
  {
    ...aUserDataProcessing,
    choice: UserDataProcessingChoiceEnum.DELETE,
    status: UserDataProcessingStatusEnum.PENDING
  },
  ProcessableUserDataDelete.decode,
  E.mapLeft(readableReport),
  E.getOrElseW((e) =>
    assert.fail(`Failed creating a mock input document: ${e}`)
  )
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

// this mock will default to a not failed request to be transparent for old tests
// we will override this just to test new logic for failed requests
const isFailedUserDataProcessingActivity = vi.fn().mockImplementation(() =>
  IsFailedUserDataProcessingActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: false
  })
);

const setUserDataProcessingStatusActivity = vi.fn().mockImplementation(() =>
  SetUserDataProcessingStatusActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const getUserDataProcessingActivity = vi.fn().mockImplementation(() =>
  GetUserDataProcessingActivityResultNotFoundFailure.encode({
    kind: "NOT_FOUND_FAILURE"
  })
);

const setUserSessionLockActivity = vi.fn().mockImplementation(() =>
  SetUserSessionLockActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const deleteUserDataActivity = vi.fn().mockImplementation(() =>
  DeleteUserDataActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const sendUserDataDeleteEmailActivity = vi.fn().mockImplementation(() =>
  SendUserDataDeleteEmailActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);

const getProfileActivity = vi.fn().mockImplementation(() =>
  GetProfileActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: aRetrievedProfile
  })
);

const getServicePreferencesActivity = vi.fn().mockImplementation(() =>
  GetServicesPreferencesActivityResultSuccess.encode({
    kind: "SUCCESS",
    preferences: [aRetrievedServicePreferences]
  })
);

const updateSubscriptionFeed = vi.fn().mockImplementation(() => "SUCCESS");

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
    : name === "GetServicesPreferencesActivity"
    ? getServicePreferencesActivity
    : name === "UpdateSubscriptionsFeedActivity"
    ? updateSubscriptionFeed
    : name === "IsFailedUserDataProcessingActivity"
    ? isFailedUserDataProcessingActivity
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

const mockIsUserEligibleForInstantDelete = vi
  .fn()
  .mockImplementation((_) => false);

// just a convenient cast, good for every test case
const context = (mockOrchestratorContext as unknown) as IOrchestrationFunctionContext;

// timer are not delayed for test, but we set default values
// to test any override, i.e. the grace period for failed requests
const waitForAbortInterval = 1 as Day;
const waitForDownloadInterval = 1 as Hour;

const expectedRetryOptions = expect.any(Object);

describe("createUserDataDeleteOrchestratorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all requests: should fail on invalid input", () => {
    mockOrchestratorGetInput.mockReturnValueOnce("invalid input");

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);

    expect(getProfileActivity).not.toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(context.df.createTimer).not.toHaveBeenCalled();

    expect(setUserSessionLockActivity).not.toHaveBeenCalled();

    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("all requests: should set status as FAILED if user profile does not exist", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    getProfileActivity.mockImplementationOnce(() =>
      GetProfileActivityResultNotFoundFailure.encode({
        kind: "NOT_FOUND_FAILURE"
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);
    expect(getProfileActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      })
    );

    expect(isFailedUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(context.df.createTimer).not.toHaveBeenCalled();

    expect(setUserSessionLockActivity).not.toHaveBeenCalled();

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("new processing requests: should set status as FAILED if fails to lock the user session", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    setUserSessionLockActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    // if session lock fails WIP status is never set, we just put it in FAILED
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("new processing requests: should set status as FAILED if fails to set the operation as WIP", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("new processing requests: should set status as FAILED if fails delete user data", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    deleteUserDataActivity.mockImplementationOnce(
      () => "any unsuccessful value"
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("new processing requests: should set status as FAILED if fails to unlock the user session", () => {
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
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(3);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();

    // data has been deletes
    expect(deleteUserDataActivity).toHaveBeenCalled();

    // the email has been sent
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should set status as FAILED if fails to set the operation as CLOSED", () => {
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
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(3);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();

    expect(deleteUserDataActivity).toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();

    expect(updateSubscriptionFeed).toHaveBeenCalled();
  });

  it("new processing requests: should delete profile, send email and set status as CLOSED if wait interval expires", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should delete profile, send email and set status as CLOSED without waiting the grace period if the user is enabled for instant delete", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);
    mockIsUserEligibleForInstantDelete.mockReturnValueOnce(true);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is skipped
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      context.df.currentUtcDateTime
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should not delete profile and set status as CLOSED if abort request comes before wait interval expires", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    // I trick the implementation of Task.any to return the second event, not the first
    mockOrchestratorTaskAny.mockImplementationOnce(([, _]) => _);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(mockOrchestratorCancelTimer).toHaveBeenCalledTimes(1);

    expect(setUserSessionLockActivity).not.toHaveBeenCalled();

    // if abort event is sent no WIP status is set, only CLOSED
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("new processing requests: should wait if there are pending downloads, then delete profile, send email and set status as CLOSED", () => {
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
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test timers
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(3);
    // test that grace period is respected for abort
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );
    // test that we wait for pending download
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addHours(context.df.currentUtcDateTime, waitForDownloadInterval)
    );
    // test that we wait for wip download
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addHours(context.df.currentUtcDateTime, waitForDownloadInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(3);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should send a confirmation email if the operation succeeded", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fiscalCode: aProcessableUserDataDelete.fiscalCode,
        toAddress: aProfile.email
      })
    );

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should not send a confirmation email if the email is not present", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    getProfileActivity.mockImplementationOnce(() =>
      GetProfileActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: { ...aRetrievedProfile, email: undefined }
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should not send a confirmation email if the email is not enabled", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    getProfileActivity.mockImplementationOnce(() =>
      GetProfileActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: { ...aRetrievedProfile, isEmailEnabled: false }
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should set status as FAILED if subscription feed fails to update (LEGACY Mode)", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    getProfileActivity.mockImplementationOnce(() =>
      GetProfileActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: {
          ...aRetrievedProfile,
          servicePreferencesSettings: {
            ...aRetrievedProfile.servicePreferencesSettings,
            mode: ServicesPreferencesModeEnum.LEGACY,
            version: -1
          }
        }
      })
    );

    updateSubscriptionFeed.mockImplementationOnce(() => "FAILURE");

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("new processing requests: should set status as FAILED if subscription feed fails to update (no LEGACY Mode)", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    updateSubscriptionFeed.mockImplementationOnce(() => "FAILURE");

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();
    expect(isFailedUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    // test that grace period is respected
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, waitForAbortInterval)
    );

    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(1);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).toHaveBeenCalled();
    expect(getUserDataProcessingActivity).toHaveBeenCalledTimes(1);

    expect(deleteUserDataActivity).toHaveBeenCalled();
    expect(deleteUserDataActivity).toHaveBeenCalledTimes(1);

    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalled();
    expect(sendUserDataDeleteEmailActivity).toHaveBeenCalledTimes(1);

    expect(updateSubscriptionFeed).toHaveBeenCalled();
    expect(updateSubscriptionFeed).toHaveBeenCalledTimes(1);
  });

  it("failed processing requests: should set status as FAILED if error occurs in checking failed request", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    isFailedUserDataProcessingActivity.mockImplementationOnce(() =>
      IsFailedUserDataProcessingActivityResultFailure.encode({
        kind: "FAILURE",
        reason: "Any reason"
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorFailure.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);
    expect(getProfileActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      })
    );

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    expect(context.df.createTimer).not.toHaveBeenCalled();

    expect(setUserSessionLockActivity).not.toHaveBeenCalled();

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(1);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    );

    expect(getUserDataProcessingActivity).not.toHaveBeenCalled();

    expect(deleteUserDataActivity).not.toHaveBeenCalled();

    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).not.toHaveBeenCalled();
  });

  it("failed processing requests: should set status as CLOSED without sending email and with a 0 grace period", () => {
    mockOrchestratorGetInput.mockReturnValueOnce(aProcessableUserDataDelete);

    isFailedUserDataProcessingActivity.mockImplementationOnce(() =>
      IsFailedUserDataProcessingActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: true
      })
    );

    const result = consumeOrchestrator(
      createUserDataDeleteOrchestratorHandler(
        waitForAbortInterval,
        mockIsUserEligibleForInstantDelete,
        waitForDownloadInterval
      )(context)
    );

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);

    expect(getProfileActivity).toHaveBeenCalled();
    expect(getProfileActivity).toHaveBeenCalledTimes(1);
    expect(getProfileActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      })
    );

    expect(isFailedUserDataProcessingActivity).toHaveBeenCalled();

    // test that no grace period has been given
    expect(context.df.createTimer).toHaveBeenCalled();
    expect(context.df.createTimer).toHaveBeenCalledTimes(1);
    expect(context.df.createTimer).toHaveBeenCalledWith(
      addDays(context.df.currentUtcDateTime, 0 as Day)
    ); // this works because mocked context has the same currentUtcDateTime

    expect(getUserDataProcessingActivity).toHaveBeenCalled();

    expect(setUserSessionLockActivity).toHaveBeenCalled();
    expect(setUserSessionLockActivity).toHaveBeenCalledTimes(2);
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "LOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );
    expect(setUserSessionLockActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        action: "UNLOCK",
        fiscalCode: aProcessableUserDataDelete.fiscalCode
      }
    );

    expect(deleteUserDataActivity).toHaveBeenCalled();

    // test that no email has been sent
    expect(sendUserDataDeleteEmailActivity).not.toHaveBeenCalled();

    expect(updateSubscriptionFeed).toHaveBeenCalled();

    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled();
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    );
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      expect.objectContaining({
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    );
  });
});
