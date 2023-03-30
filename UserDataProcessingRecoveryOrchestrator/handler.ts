import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  IOrchestrationFunctionContext,
  RetryOptions,
  Task
} from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

import * as t from "io-ts";
import { FailedUserDataProcessing } from "../utils/user_data_types";
import { ActivityInput as SetUserDataProcessingStatusActivityInput } from "../UserDataDownloadWorkflow/activities/SetUserDataProcessingStatusActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../UserDataDownloadWorkflow/activities/SetUserDataProcessingStatusActivity/handler";
import {
  ActivityInput as CheckLastStatusActivityInput,
  ActivityResultSuccess as CheckLastStatusActivityResultSuccess
} from "../UserDataProcessingCheckLastStatusActivity/handler";
import {
  ActivityInput as FindFailureReasonActivityInput,
  ActivityResultSuccess as FindFailureReasonActivityResultSuccess
} from "../UserDataProcessingFindFailureReasonActivity/handler";

const logPrefix = "UserDataProcessingRecoveryOrchestrator";

const printableError = (error: Error | t.Errors | unknown): string =>
  error instanceof Error
    ? error.message
    : Array.isArray(error)
    ? readableReport(error)
    : String(error);

export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT"),
  reason: t.string
});

export type UnhandledFailure = t.TypeOf<typeof UnhandledFailure>;
export const UnhandledFailure = t.interface({
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
  UnhandledFailure,
  ActivityFailure
]);

export type OrchestratorSuccess = t.TypeOf<typeof OrchestratorSuccess>;
export const OrchestratorSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  type: t.keyof({ ABORTED: null, COMPLETED: null })
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

const retryOptions = new RetryOptions(5000, 10);
// eslint-disable-next-line functional/immutable-data
retryOptions.backoffCoefficient = 1.5;

const toActivityFailure = (
  err: { readonly kind: string },
  activityName: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  extra?: object
): ActivityFailure =>
  ActivityFailure.encode({
    activityName,
    extra,
    kind: "ACTIVITY",
    reason: err.kind
  });

function* getLastStatus(
  context: IOrchestrationFunctionContext,
  failedUserDataProcessing: FailedUserDataProcessing
): Generator<Task, CheckLastStatusActivityResultSuccess> {
  // we call the activity that gets the last status of for the given record
  context.log.info(
    `${logPrefix}|INFO|Getting last status for ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode}`
  );
  const result = yield context.df.callActivity(
    "UserDataProcessingCheckLastStatusActivity",
    CheckLastStatusActivityInput.encode({
      choice: failedUserDataProcessing.choice,
      fiscalCode: failedUserDataProcessing.fiscalCode
    })
  );

  return pipe(
    result,
    CheckLastStatusActivityResultSuccess.decode,
    E.getOrElse(e => {
      context.log.error(
        `${logPrefix}|ERROR|UserDataProcessingCheckLastStatusActivity fail|${readableReport(
          e
        )}|result=${JSON.stringify(result)}`
      );
      throw toActivityFailure(
        { kind: "USER_DATA_PROCESSING_CHECK_LAST_STATUS_ACTIVITY_RESULT" },
        "UserDataProcessingCheckLastStatusActivity"
      );
    })
  );
}

function* searchForFailureReason(
  context: IOrchestrationFunctionContext,
  failedUserDataProcessing: FailedUserDataProcessing
): Generator<Task, FindFailureReasonActivityResultSuccess> {
  // we return the reason of the failed record if there is one
  // we need this to recover any request that had a reason of failure
  // but was not tracked into FailedUserDataProcessing table storage
  if (failedUserDataProcessing.reason) {
    return FindFailureReasonActivityResultSuccess.encode({
      kind: "SUCCESS",
      value: failedUserDataProcessing.reason
    });
  }
  // if there is no reason in the failed record
  // we call the activity that searchs for one
  context.log.info(
    `${logPrefix}|INFO|Searching for failure reason of ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode}`
  );
  const result = yield context.df.callActivity(
    "UserDataProcessingFindFailureReasonActivity",
    FindFailureReasonActivityInput.encode({
      choice: failedUserDataProcessing.choice,
      fiscalCode: failedUserDataProcessing.fiscalCode
    })
  );

  return pipe(
    result,
    FindFailureReasonActivityResultSuccess.decode,
    E.getOrElse(e => {
      context.log.error(
        `${logPrefix}|ERROR|UserDataProcessingFindFailureReasonActivity fail|${readableReport(
          e
        )}|result=${JSON.stringify(result)}`
      );
      throw toActivityFailure(
        { kind: "USER_DATA_PROCESSING_FIND_FAILURE_REASON_ACTIVITY_RESULT" },
        "UserDataProcessingFindFailureReasonActivity"
      );
    })
  );
}

function* saveNewFailedRecordWithReason(
  context: IOrchestrationFunctionContext,
  currentRecord: FailedUserDataProcessing,
  failureReason: NonEmptyString
): Generator<Task, SetUserDataProcessingStatusActivityResultSuccess> {
  // we call the activity tha saves a new record with failed status and a failure reason
  context.log.info(
    `${logPrefix}|INFO|Saving reason ${failureReason} for ${currentRecord.choice}-${currentRecord.fiscalCode}`
  );
  const result = yield context.df.callActivityWithRetry(
    "SetUserDataProcessingStatusActivity",
    retryOptions,
    SetUserDataProcessingStatusActivityInput.encode({
      currentRecord,
      failureReason,
      nextStatus: UserDataProcessingStatusEnum.FAILED
    })
  );
  return pipe(
    result,
    SetUserDataProcessingStatusActivityResultSuccess.decode,
    E.getOrElse(e => {
      context.log.error(
        `${logPrefix}|ERROR|SetUserDataProcessingStatusActivity fail|${readableReport(
          e
        )}|result=${JSON.stringify(result)}`
      );
      throw toActivityFailure(
        { kind: "SET_USER_DATA_PROCESSING_STATUS_ACTIVITY_RESULT" },
        "SetUserDataProcessingStatusActivity"
      );
    })
  );
}

export const handler = function*(
  context: IOrchestrationFunctionContext
): Generator<unknown, OrchestratorResult> {
  const document = context.df.getInput();

  const failedUserDataProcessingOrError = pipe(
    document,
    FailedUserDataProcessing.decode,
    E.mapLeft(err => {
      context.log.error(
        `${logPrefix}|WARN|Cannot decode FailedUserDataProcessing document: ${readableReport(
          err
        )}`
      );
      return InvalidInputFailure.encode({
        kind: "INVALID_INPUT",
        reason: readableReport(err)
      });
    })
  );

  // I have to unbox value because yield* does not work inside map
  if (E.isLeft(failedUserDataProcessingOrError)) {
    return failedUserDataProcessingOrError.left;
  }

  const failedUserDataProcessing = failedUserDataProcessingOrError.right;

  context.log.verbose(
    `${logPrefix}|VERBOSE|Recovery started for failed record ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode}`,
    failedUserDataProcessing
  );

  try {
    // check the last status
    const checkLastStatusResult = yield* getLastStatus(
      context,
      failedUserDataProcessing
    );

    if (checkLastStatusResult.value !== UserDataProcessingStatusEnum.FAILED) {
      context.log.info(
        `${logPrefix}|INFO|Skipping record ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode} with status ${checkLastStatusResult.value}`
      );
      return OrchestratorResult.encode({ kind: "SKIPPED" });
    }

    // search for a failure reason
    const findFailureReasonResult = yield* searchForFailureReason(
      context,
      failedUserDataProcessing
    );

    const failureReason = findFailureReasonResult.value;

    // save a new failed record with the found failure reason
    // we duplicate failed records adding another one with reason
    // this is not a problem because the set of pending failed requests
    // is relatively small and this function will be called ideally only once
    yield* saveNewFailedRecordWithReason(
      context,
      failedUserDataProcessing,
      failureReason
    );

    context.log.info(
      `${logPrefix}|INFO|Recovery finished for failed record ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode}`
    );
    return OrchestratorResult.encode({ kind: "SUCCESS", type: "COMPLETED" });
  } catch (error) {
    context.log.error(
      `${logPrefix}|ERROR|Recovery failed for record ${
        failedUserDataProcessing.choice
      }-${failedUserDataProcessing.fiscalCode}: ${printableError(error)}`
    );

    return pipe(
      error,
      OrchestratorFailure.decode,
      E.getOrElse(_ =>
        UnhandledFailure.encode({
          kind: "UNHANDLED",
          reason: printableError(error)
        })
      )
    );
  }
};
