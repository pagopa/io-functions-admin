// eslint-disable @typescript-eslint/no-explicit-any
import * as E from "fp-ts/lib/Either";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  mockOrchestratorCallActivity,
  mockOrchestratorCallActivityWithRetry,
  mockOrchestratorContext,
  mockOrchestratorGetInput
} from "../../__mocks__/durable-functions";
import { aArchiveInfo, aUserDataProcessing } from "../../__mocks__/mocks";
import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "../../ExtractUserDataActivity/handler";
import { ActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess } from "../../SendUserDataDownloadMessageActivity/handler";
import {
  ActivityFailure,
  handler,
  InvalidInputFailure,
  OrchestratorSuccess
} from "../handler";

import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../../SetUserDataProcessingStatusActivity/handler";

const aNonSuccess = "any non-success value";

const setUserDataProcessingStatusActivity = jest.fn().mockImplementation(() =>
  SetUserDataProcessingStatusActivityResultSuccess.encode({
    kind: "SUCCESS"
  })
);
const extractUserDataActivity = jest.fn().mockImplementation(() =>
  ExtractUserDataActivityResultSuccess.encode({
    kind: "SUCCESS",
    value: aArchiveInfo
  })
);
const sendUserDataDownloadMessageActivity = jest
  .fn()
  .mockImplementation(() =>
    SendUserDataDownloadMessageActivityResultSuccess.encode({ kind: "SUCCESS" })
  );

// A mock implementation proxy for df.callActivity/df.df.callActivityWithRetry that routes each call to the correct mock implentation
const switchMockImplementation = (name: string, ...args: readonly unknown[]) =>
  (name === "SetUserDataProcessingStatusActivity"
    ? setUserDataProcessingStatusActivity
    : name === "ExtractUserDataActivity"
    ? extractUserDataActivity
    : name === "SendUserDataDownloadMessageActivity"
    ? sendUserDataDownloadMessageActivity
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

// just a convenient cast, good for every test case
const context = (mockOrchestratorContext as unknown) as IOrchestrationFunctionContext;

const expectedRetryOptions = expect.any(Object);

// eslint-disable-next-line sonar/sonar-max-lines-per-function
describe("UserDataDownloadOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fail on invalid input", () => {
    const document = "invalid";
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
    expect(extractUserDataActivity).not.toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).not.toHaveBeenCalled();
  });

  it.each`
    name        | status
    ${"WIP"}    | ${UserDataProcessingStatusEnum.WIP}
    ${"CLOSED"} | ${UserDataProcessingStatusEnum.CLOSED}
  `("should skip if the status is $name", ({ status }) => {
    const document = {
      ...aUserDataProcessing,
      status
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(InvalidInputFailure.decode(result))).toBe(true);
    expect(setUserDataProcessingStatusActivity).not.toHaveBeenCalled();
    expect(extractUserDataActivity).not.toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).not.toHaveBeenCalled();
  });

  it("should success if everything goes well", () => {
    const document = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(OrchestratorSuccess.decode(result))).toBe(true);
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledTimes(2);
    // first, set as WIP
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.WIP
      }
    );
    // then, set as CLOSED
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      }
    );
    expect(extractUserDataActivity).toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).toHaveBeenCalled();
  });

  it("should set as FAILED when data extraction fails", () => {
    extractUserDataActivity.mockImplementationOnce(() => aNonSuccess);

    const document = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(ActivityFailure.decode(result))).toBe(true);
    expect(result.activityName).toBe("ExtractUserDataActivity");
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled(); // any times, at least one
    // then, set as FAILED
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.FAILED,
        failureReason: expect.any(String)
      }
    );
    expect(extractUserDataActivity).toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).not.toHaveBeenCalled();
  });

  it("should set as FAILED when send message fails", () => {
    sendUserDataDownloadMessageActivity.mockImplementationOnce(
      () => aNonSuccess
    );

    const document = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(ActivityFailure.decode(result))).toBe(true);
    expect(result.activityName).toBe("SendUserDataDownloadMessageActivity");
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled(); // any times, at least one
    // then, set as FAILED
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.FAILED,
        failureReason: expect.any(String)
      }
    );
    expect(extractUserDataActivity).toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).toHaveBeenCalled();
  });

  it("should set as FAILED when status update to WIP fails", () => {
    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => aNonSuccess
    );

    const document = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    expect(E.isRight(ActivityFailure.decode(result))).toBe(true);

    // activity failure during the first SetUserDataProcessingStatusActivity to WIP
    expect(result.activityName).toBe("SetUserDataProcessingStatusActivity");
    expect(result.extra).toEqual({
      status: UserDataProcessingStatusEnum.WIP
    });
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled(); // any times, at least one

    // the last call to SetUserDataProcessingStatusActivity should be set as FAILED with a reason
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.FAILED,
        failureReason: expect.any(String)
      }
    );
    expect(extractUserDataActivity).not.toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).not.toHaveBeenCalled();
  });

  it("should set as FAILED when status update to CLOSED fails", () => {
    // the first time is called is for WIP
    setUserDataProcessingStatusActivity.mockImplementationOnce(() =>
      SetUserDataProcessingStatusActivityResultSuccess.encode({
        kind: "SUCCESS"
      })
    );

    setUserDataProcessingStatusActivity.mockImplementationOnce(
      () => aNonSuccess
    );

    const document = {
      ...aUserDataProcessing,
      status: UserDataProcessingStatusEnum.PENDING
    };
    mockOrchestratorGetInput.mockReturnValueOnce(document);

    const result = consumeOrchestrator(handler(context));

    // activity failure during the first SetUserDataProcessingStatusActivity to CLOSED
    expect(E.isRight(ActivityFailure.decode(result))).toBe(true);
    expect(result.activityName).toBe("SetUserDataProcessingStatusActivity");
    expect(result.extra).toEqual({
      status: UserDataProcessingStatusEnum.CLOSED
    });
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalled(); // any times, at least one

    // the last call to SetUserDataProcessingStatusActivity should be set as FAILED with a reason
    expect(setUserDataProcessingStatusActivity).toHaveBeenCalledWith(
      expect.any(String),
      expectedRetryOptions,
      {
        currentRecord: expect.any(Object),
        nextStatus: UserDataProcessingStatusEnum.FAILED,
        failureReason: expect.any(String)
      }
    );
    expect(extractUserDataActivity).toHaveBeenCalled();
    expect(sendUserDataDownloadMessageActivity).toHaveBeenCalled();
  });
});
