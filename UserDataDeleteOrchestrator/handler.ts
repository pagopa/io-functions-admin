import { IFunctionContext, Task } from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import { toString } from "fp-ts/lib/function";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { Day } from "italia-ts-commons/lib/units";
import {
  ActivityInput as DeleteUserDataActivityInput,
  ActivityResultSuccess as DeleteUserDataActivityResultSuccess
} from "../DeleteUserDataActivity/types";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";
import {
  ActivityInput as SetUserSessionLockActivityInput,
  ActivityResultSuccess as SetUserSessionLockActivityResultSuccess
} from "../SetUserSessionLockActivity/handler";
import { ProcessableUserDataDelete } from "../UserDataProcessingTrigger";
import { ABORT_EVENT } from "./utils";

const logPrefix = "UserDataDeleteOrchestrator";
const aDayInMilliseconds = 24 * 60 * 60 * 1000;

const printableError = (error: Error | unknown): string =>
  error instanceof Error ? error.message : toString(error);

const makeWaitIntervalFinishDate = (context: IFunctionContext, days: Day) =>
  new Date(context.df.currentUtcDateTime.getTime() + days * aDayInMilliseconds);

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
  kind: t.literal("SUCCESS")
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

const toActivityFailure = (
  err: t.Errors,
  activityName: string,
  extra?: object
) =>
  ActivityFailure.encode({
    activityName,
    extra,
    kind: "ACTIVITY",
    reason: readableReport(err)
  });

function* setUserSessionLock(
  context: IFunctionContext,
  { action, fiscalCode }: SetUserSessionLockActivityInput
): IterableIterator<SetUserSessionLockActivityInput | Task> {
  const result = yield context.df.callActivity(
    "SetUserSessionLockActivity",
    SetUserSessionLockActivityInput.encode({
      action,
      fiscalCode
    })
  );
  return SetUserSessionLockActivityResultSuccess.decode(result).getOrElseL(
    err => {
      throw toActivityFailure(err, "SetUserSessionLockActivity", {
        action
      });
    }
  );
}

function* setUserDataProcessingStatus(
  context: IFunctionContext,
  currentRecord: UserDataProcessing,
  nextStatus: UserDataProcessingStatusEnum
): IterableIterator<SetUserDataProcessingStatusActivityResultSuccess | Task> {
  const result = yield context.df.callActivity(
    "SetUserDataProcessingStatusActivity",
    {
      currentRecord,
      nextStatus
    }
  );
  return SetUserDataProcessingStatusActivityResultSuccess.decode(
    result
  ).getOrElseL(err => {
    throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
      status: nextStatus
    });
  });
}

function* deleteUserData(
  context: IFunctionContext,
  currentRecord: UserDataProcessing
): IterableIterator<DeleteUserDataActivityResultSuccess | Task> {
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
  return DeleteUserDataActivityResultSuccess.decode(result).getOrElseL(err => {
    throw toActivityFailure(err, "DeleteUserDataActivity");
  });
}

export const createUserDataDeleteOrchestratorHandler = (waitInterval: Day) =>
  function*(context: IFunctionContext): IterableIterator<unknown> {
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

    try {
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

      // we have an interval on which we wait for eventual cancellation bu the user
      const intervalExpiredEvent = context.df.createTimer(
        makeWaitIntervalFinishDate(context, waitInterval)
      );

      // we wait for eventually abort message from the user
      const canceledRequestEvent = context.df.waitForExternalEvent(ABORT_EVENT);

      // the first that get triggered
      const triggeredEvent = yield context.df.Task.any([
        intervalExpiredEvent,
        canceledRequestEvent
      ]);

      if (triggeredEvent === intervalExpiredEvent) {
        // backup&delete data
        yield* deleteUserData(context, currentUserDataProcessing);

        // set as closed
        yield* setUserDataProcessingStatus(
          context,
          currentUserDataProcessing,
          UserDataProcessingStatusEnum.CLOSED
        );
      } else {
        // set as aborted
        yield* setUserDataProcessingStatus(
          context,
          currentUserDataProcessing,
          UserDataProcessingStatusEnum.ABORTED
        );
      }

      // unlock user
      yield* setUserSessionLock(context, {
        action: "UNLOCK",
        fiscalCode: currentUserDataProcessing.fiscalCode
      });

      return OrchestratorSuccess.encode({ kind: "SUCCESS" });
    } catch (error) {
      context.log.error(
        `${logPrefix}|ERROR|Failed processing user data for download: ${printableError(
          error
        )}`
      );
      SetUserDataProcessingStatusActivityResultSuccess.decode(
        yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.FAILED
        })
      ).getOrElseL(err => {
        throw new Error(
          `Activity SetUserDataProcessingStatusActivity (status=FAILED) failed: ${readableReport(
            err
          )}`
        );
      });

      return OrchestratorFailure.is(error)
        ? error
        : UnhanldedFailure.encode({
            kind: "UNHANDLED",
            reason: error.message
          });
    }
  };
