import * as df from "durable-functions";
import {
  IOrchestrationFunctionContext,
  Task,
  TaskSet
} from "durable-functions/lib/src/classes";
import { isLeft, toError } from "fp-ts/lib/Either";
import { toString } from "fp-ts/lib/function";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { RetrievedProfile } from "@pagopa/io-functions-commons/dist/src/models/profile";
import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { Day, Hour } from "@pagopa/ts-commons/lib/units";
import {
  ActivityInput as DeleteUserDataActivityInput,
  ActivityResultSuccess as DeleteUserDataActivityResultSuccess
} from "../DeleteUserDataActivity/types";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import {
  ActivityInput as GetProfileActivityInput,
  ActivityResultSuccess as GetProfileActivityResultSuccess
} from "../GetProfileActivity/handler";
import {
  ActivityInput as GetUserDataProcessingStatusActivityInput,
  ActivityResult as GetUserDataProcessingStatusActivityResult,
  ActivityResultNotFoundFailure as GetUserDataProcessingStatusActivityResultNotFoundFailure,
  ActivityResultSuccess as GetUserDataProcessingStatusActivityResultSuccess
} from "../GetUserDataProcessingActivity/handler";
import {
  ActivityInput as SendUserDataDeleteEmailActivityInput,
  ActivityResultSuccess as SendUserDataDeleteEmailActivityResultSuccess
} from "../SendUserDataDeleteEmailActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";
import {
  ActivityInput as SetUserSessionLockActivityInput,
  ActivityResultSuccess as SetUserSessionLockActivityResultSuccess
} from "../SetUserSessionLockActivity/handler";

import { ActivityInput as UpdateServiceSubscriptionFeedActivityInput } from "../UpdateSubscriptionsFeedActivity/types";
import { ProcessableUserDataDelete } from "../UserDataProcessingTrigger";
import {
  trackUserDataDeleteEvent,
  trackUserDataDeleteException
} from "../utils/appinsightsEvents";
import { ABORT_EVENT, addDays, addHours } from "./utils";

const logPrefix = "UserDataDeleteOrchestrator";

const printableError = (error: Error | unknown): string =>
  error instanceof Error ? error.message : toString(error);

export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT"),
  reason: t.string
});

export type UnhanldedFailure = t.TypeOf<typeof UnhanldedFailure>;
export const UnhanldedFailure = t.interface({
  kind: t.literal("UNHANDLED"),
  reason: t.string
});

export type ActivityFailure = t.TypeOf<typeof ActivityFailure>;
export const ActivityFailure = t.intersection([
  t.interface({
    activityName: t.string,
    kind: t.literal("ACTIVITY"),
    reason: t.string
  }),
  t.partial({ extra: t.object })
]);

export type OrchestratorFailure = t.TypeOf<typeof OrchestratorFailure>;
export const OrchestratorFailure = t.taggedUnion("kind", [
  InvalidInputFailure,
  UnhanldedFailure,
  ActivityFailure
]);

export type OrchestratorSuccess = t.TypeOf<typeof OrchestratorSuccess>;
export const OrchestratorSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  type: t.keyof({ ABORTED: null, DELETED: null })
});

export type SkippedDocument = t.TypeOf<typeof SkippedDocument>;
export const SkippedDocument = t.interface({
  kind: t.literal("SKIPPED")
});

export type OrchestratorResult = t.TypeOf<typeof OrchestratorResult>;
export const OrchestratorResult = t.union([
  OrchestratorFailure,
  SkippedDocument,
  OrchestratorSuccess
]);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const toActivityFailure = (
  err: { readonly kind: string },
  activityName: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  extra?: object
) =>
  ActivityFailure.encode({
    activityName,
    extra,
    kind: "ACTIVITY",
    reason: err.kind
  });

function* setUserSessionLock(
  context: IOrchestrationFunctionContext,
  { action, fiscalCode }: SetUserSessionLockActivityInput
): Generator<Task> {
  const result = yield context.df.callActivity(
    "SetUserSessionLockActivity",
    SetUserSessionLockActivityInput.encode({
      action,
      fiscalCode
    })
  );
  return SetUserSessionLockActivityResultSuccess.decode(result).getOrElseL(
    _ => {
      context.log.error(
        `${logPrefix}|ERROR|SetUserSessionLockActivity fail|${readableReport(
          _
        )}`
      );
      throw toActivityFailure(
        { kind: "SET_USER_SESSION_LOCK" },
        "SetUserSessionLockActivity",
        {
          action
        }
      );
    }
  );
}

function* setUserDataProcessingStatus(
  context: IOrchestrationFunctionContext,
  currentRecord: UserDataProcessing,
  nextStatus: UserDataProcessingStatusEnum
): Generator<Task> {
  const result = yield context.df.callActivity(
    "SetUserDataProcessingStatusActivity",
    {
      currentRecord,
      nextStatus
    }
  );
  return SetUserDataProcessingStatusActivityResultSuccess.decode(
    result
  ).getOrElseL(_ => {
    throw toActivityFailure(
      { kind: "SET_USER_DATA_PROCESSING_STATUS_ACTIVITY_RESULT" },
      "SetUserDataProcessingStatusActivity",
      {
        status: nextStatus
      }
    );
  });
}

function* hasPendingDownload(
  context: IOrchestrationFunctionContext,
  fiscalCode: FiscalCode
): Generator<Task> {
  const result = yield context.df.callActivity(
    "GetUserDataProcessingActivity",
    GetUserDataProcessingStatusActivityInput.encode({
      choice: UserDataProcessingChoiceEnum.DOWNLOAD,
      fiscalCode
    })
  );

  return GetUserDataProcessingStatusActivityResult.decode(result).fold(
    _ => {
      throw toActivityFailure(
        { kind: "GET_USER_DATA_PROCESSING_ACTIVITY_RESULT" },
        "GetUserDataProcessingActivity"
      );
    }, // check if
    response => {
      if (GetUserDataProcessingStatusActivityResultSuccess.is(response)) {
        return [
          UserDataProcessingStatusEnum.PENDING,
          UserDataProcessingStatusEnum.WIP
        ].includes(response.value.status);
      } else if (
        GetUserDataProcessingStatusActivityResultNotFoundFailure.is(response)
      ) {
        return false;
      }

      throw toActivityFailure(response, "GetUserDataProcessingActivity");
    }
  );
}

function* deleteUserData(
  context: IOrchestrationFunctionContext,
  currentRecord: UserDataProcessing
): Generator<Task> {
  const backupFolder = `${
    currentRecord.userDataProcessingId
  }-${context.df.currentUtcDateTime.getTime()}` as NonEmptyString;
  const result = yield context.df.callActivity(
    "DeleteUserDataActivity",
    DeleteUserDataActivityInput.encode({
      backupFolder,
      fiscalCode: currentRecord.fiscalCode
    })
  );
  return DeleteUserDataActivityResultSuccess.decode(result).getOrElseL(_ => {
    context.log.error(
      `${logPrefix}|ERROR|DeleteUserDataActivity fail`,
      result,
      readableReport(_)
    );
    throw toActivityFailure(
      { kind: "DELETE_USER_DATA" },
      "DeleteUserDataActivity"
    );
  });
}

function* sendUserDataDeleteEmail(
  context: IOrchestrationFunctionContext,
  toAddress: EmailAddress,
  fiscalCode: FiscalCode
): Generator<Task> {
  const result = yield context.df.callActivity(
    "SendUserDataDeleteEmailActivity",
    SendUserDataDeleteEmailActivityInput.encode({
      fiscalCode,
      toAddress
    })
  );
  return SendUserDataDeleteEmailActivityResultSuccess.decode(result).getOrElseL(
    _ => {
      context.log.error(
        `${logPrefix}|ERROR|SendUserDataDeleteEmailActivity fail|${readableReport(
          _
        )}`
      );
      throw toActivityFailure(
        { kind: "SEND_USER_DELETE_EMAIL_ACTIVITY_RESULT" },
        "SetUserDataProcessingStatusActivity"
      );
    }
  );
}

function* getProfile(
  context: IOrchestrationFunctionContext,
  fiscalCode: FiscalCode
): Generator<Task, RetrievedProfile> {
  const result = yield context.df.callActivity(
    "GetProfileActivity",
    GetProfileActivityInput.encode({
      fiscalCode
    })
  );
  return GetProfileActivityResultSuccess.decode(result).getOrElseL(_ => {
    context.log.error(
      `${logPrefix}|ERROR|GetProfileActivity fail|${readableReport(
        _
      )}|result=${JSON.stringify(result)}`
    );
    throw toActivityFailure(
      { kind: "GET_PROFILE_ACTIVITY_RESULT" },
      "GetProfileActivity"
    );
  }).value;
}

function* updateSubscriptionFeed(
  context: IOrchestrationFunctionContext,
  { fiscalCode, version }: RetrievedProfile
): Generator<Task, "SUCCESS"> {
  const input = UpdateServiceSubscriptionFeedActivityInput.encode({
    fiscalCode,
    operation: "UNSUBSCRIBED",
    subscriptionKind: "PROFILE",
    updatedAt: context.df.currentUtcDateTime.getTime(),
    version
  });
  const retryOptions = new df.RetryOptions(5000, 10);
  const result = yield context.df.callActivityWithRetry(
    "UpdateSubscriptionsFeedActivity",
    retryOptions,
    input
  );
  if (result === "FAILURE") {
    context.log.error(
      `${logPrefix}|ERROR|UpdateSubscriptionsFeedActivity fail`
    );
    throw toActivityFailure(
      { kind: "UPDATE_SUBSCRIPTIONS_FEED" },
      "UpdateSubscriptionsFeedActivity"
    );
  }
  return "SUCCESS";
}

/**
 * Create a handler for the orchestrator
 *
 * @param waitForAbortInterval Indicates how many days the request must be left pending, waiting for an eventual abort request
 * @param waitForDownloadInterval Indicates how many hours the request must be postponed in case a download request is being processing meanwhile
 */
export const createUserDataDeleteOrchestratorHandler = (
  waitForAbortInterval: Day,
  waitForDownloadInterval: Hour = 12 as Hour
) =>
  function*(context: IOrchestrationFunctionContext): Generator<Task | TaskSet> {
    const document = context.df.getInput();
    // This check has been done on the trigger, so it should never fail.
    // However, it's worth the effort to check it twice
    const invalidInputOrCurrentUserDataProcessing = ProcessableUserDataDelete.decode(
      document
    ).mapLeft<InvalidInputFailure>(err => {
      context.log.error(
        `${logPrefix}|WARN|Cannot decode ProcessableUserDataDelete document: ${readableReport(
          err
        )}`
      );
      return InvalidInputFailure.encode({
        kind: "INVALID_INPUT",
        reason: readableReport(err)
      });
    });

    if (isLeft(invalidInputOrCurrentUserDataProcessing)) {
      return invalidInputOrCurrentUserDataProcessing.value;
    }

    const currentUserDataProcessing =
      invalidInputOrCurrentUserDataProcessing.value;

    context.log.verbose(
      `${logPrefix}|VERBOSE|Executing delete`,
      currentUserDataProcessing
    );

    try {
      // we have an interval on which we wait for eventual cancellation by the user
      const intervalExpiredEvent = context.df.createTimer(
        addDays(context.df.currentUtcDateTime, waitForAbortInterval)
      );

      // we wait for eventually abort message from the user
      const canceledRequestEvent = context.df.waitForExternalEvent(ABORT_EVENT);

      context.log.verbose(
        `${logPrefix}|VERBOSE|Operation stopped for ${waitForAbortInterval} days`
      );

      trackUserDataDeleteEvent("paused", currentUserDataProcessing);

      // the first that get triggered
      const triggeredEvent = yield context.df.Task.any([
        intervalExpiredEvent,
        canceledRequestEvent
      ]);

      if (triggeredEvent === intervalExpiredEvent) {
        context.log.verbose(
          `${logPrefix}|VERBOSE|Operation resumed after ${waitForAbortInterval} days`
        );

        // lock user session
        yield* setUserSessionLock(context, {
          action: "LOCK",
          fiscalCode: currentUserDataProcessing.fiscalCode
        });

        // set as wip
        yield* setUserDataProcessingStatus(
          context,
          currentUserDataProcessing,
          UserDataProcessingStatusEnum.WIP
        );

        // If there's a working download request, we postpone delete of one day
        while (
          yield* hasPendingDownload(
            context,
            currentUserDataProcessing.fiscalCode
          )
        ) {
          // we wait some more time for the download process to end
          context.log.verbose(
            `${logPrefix}|VERBOSE|Found an active DOWNLOAD procedure, wait for ${waitForDownloadInterval} hours`
          );
          const waitForDownloadEvent = context.df.createTimer(
            addHours(context.df.currentUtcDateTime, waitForDownloadInterval)
          );
          trackUserDataDeleteEvent("postponed", currentUserDataProcessing);
          yield waitForDownloadEvent;
        }

        // retrieve user profile
        const profile = yield* getProfile(
          context,
          currentUserDataProcessing.fiscalCode
        );

        // eslint-disable-next-line extra-rules/no-commented-out-code
        // backup&delete data
        yield* deleteUserData(context, currentUserDataProcessing);

        // we need user email to send email
        if (
          profile.email &&
          profile.isEmailValidated &&
          profile.isEmailEnabled
        ) {
          // send confirm email
          yield* sendUserDataDeleteEmail(
            context,
            profile.email,
            profile.fiscalCode
          );
        }

        // update subscription feed
        yield* updateSubscriptionFeed(context, profile);

        // set as closed
        yield* setUserDataProcessingStatus(
          context,
          currentUserDataProcessing,
          UserDataProcessingStatusEnum.CLOSED
        );

        // unlock user
        yield* setUserSessionLock(context, {
          action: "UNLOCK",
          fiscalCode: currentUserDataProcessing.fiscalCode
        });

        trackUserDataDeleteEvent("deleted", currentUserDataProcessing);
        return OrchestratorSuccess.encode({ kind: "SUCCESS", type: "DELETED" });
      } else {
        // stop the timer to let the orchestrator end
        intervalExpiredEvent.cancel();

        context.log.verbose(
          `${logPrefix}|VERBOSE|Operation resumed because of abort event`
        );

        // set as closed
        yield* setUserDataProcessingStatus(
          context,
          currentUserDataProcessing,
          UserDataProcessingStatusEnum.CLOSED
        );

        trackUserDataDeleteEvent("aborted", currentUserDataProcessing);
        return OrchestratorSuccess.encode({ kind: "SUCCESS", type: "ABORTED" });
      }
    } catch (error) {
      context.log.error(
        `${logPrefix}|ERROR|Failed processing user data for download: ${printableError(
          error
        )}`
      );
      trackUserDataDeleteException(
        "failed",
        toError(error),
        currentUserDataProcessing
      );

      SetUserDataProcessingStatusActivityResultSuccess.decode(
        yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.FAILED
        })
      ).getOrElseL(err => {
        trackUserDataDeleteException(
          "unhandled_failed_status",
          new Error(readableReport(err)),
          currentUserDataProcessing
        );
        throw new Error(
          `Activity SetUserDataProcessingStatusActivity (status=FAILED) failed: ${readableReport(
            err
          )}`
        );
      });

      return OrchestratorFailure.decode(error).getOrElse(
        UnhanldedFailure.encode({
          kind: "UNHANDLED",
          reason: printableError(error)
        })
      );
    }
  };
