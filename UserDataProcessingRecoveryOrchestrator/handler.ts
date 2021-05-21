import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  IOrchestrationFunctionContext,
  Task
} from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import { identity, toString } from "fp-ts/lib/function";
import * as t from "io-ts";
import {
  ActivityInput as CheckLastStatusActivityInput,
  ActivityResultSuccess as CheckLastStatusActivityResultSuccess
} from "../UserDataProcessingCheckLastStatusActivity/handler";
import {
  ActivityInput as FindFailureReasonActivityInput,
  ActivityResult as FindFailureReasonActivityResult,
  ActivityResultSuccess as FindFailureReasonActivityResultSuccess
} from "../UserDataProcessingFindFailureReasonActivity/handler";
import { FailedUserDataProcessing } from "../UserDataProcessingTrigger/handler";

const logPrefix = "UserDataProcessingRecoveryOrchestrator";

const printableError = (error: Error | unknown): string =>
  error instanceof Error ? error.message : toString(error);

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

function* checkLastStatus(
  context: IOrchestrationFunctionContext,
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
): Generator<Task, CheckLastStatusActivityResultSuccess> {
  const result = yield context.df.callActivity(
    "UserDataProcessingCheckLastStatusActivity",
    CheckLastStatusActivityInput.encode({
      choice,
      fiscalCode
    })
  );
  return CheckLastStatusActivityResultSuccess.decode(result).getOrElseL(e => {
    context.log.error(
      `${logPrefix}|ERROR|UserDataProcessingCheckLastStatusActivity fail|${readableReport(
        e
      )}|result=${JSON.stringify(result)}`
    );
    throw toActivityFailure(
      { kind: "USER_DATA_PROCESSING_CHECK_LAST_STATUS_ACTIVITY_RESULT" },
      "UserDataProcessingCheckLastStatusActivity"
    );
  });
}

function* findFailureReason(
  context: IOrchestrationFunctionContext,
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
): Generator<Task, FindFailureReasonActivityResult> {
  const result = yield context.df.callActivity(
    "UserDataProcessingFindFailureReasonActivity",
    FindFailureReasonActivityInput.encode({
      choice,
      fiscalCode
    })
  );
  return FindFailureReasonActivityResult.decode(result).getOrElseL(e => {
    context.log.error(
      `${logPrefix}|ERROR|UserDataProcessingFindFailureReasonActivity fail|${readableReport(
        e
      )}|result=${JSON.stringify(result)}`
    );
    throw toActivityFailure(
      { kind: "USER_DATA_PROCESSING_FIND_FAILURE_REASON_ACTIVITY_RESULT" },
      "UserDataProcessingFindFailureReasonActivity"
    );
  });
}

export const handler = function*(
  context: IOrchestrationFunctionContext
): Generator<unknown, OrchestratorResult> {
  const document = context.df.getInput();

  const failedUserDataProcessingOrError = FailedUserDataProcessing.decode(
    document
  ).mapLeft<InvalidInputFailure>(err => {
    context.log.error(
      `${logPrefix}|WARN|Cannot decode FailedUserDataProcessing document: ${readableReport(
        err
      )}`
    );
    return InvalidInputFailure.encode({
      kind: "INVALID_INPUT",
      reason: readableReport(err)
    });
  });

  // I have to unbox value because yield* does not work inside map
  if (isLeft(failedUserDataProcessingOrError)) {
    return failedUserDataProcessingOrError.value;
  }

  const failedUserDataProcessing = failedUserDataProcessingOrError.value;

  context.log.verbose(
    `${logPrefix}|VERBOSE|Recovery started for failed record ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode}`,
    failedUserDataProcessing
  );

  try {
    // retrieve the last status
    const lastStatus = yield* checkLastStatus(
      context,
      failedUserDataProcessing.choice,
      failedUserDataProcessing.fiscalCode
    );

    if (lastStatus.value !== UserDataProcessingStatusEnum.FAILED) {
      context.log.info(
        `${logPrefix}|INFO|Skipping record ${failedUserDataProcessing.choice}-${failedUserDataProcessing.fiscalCode} with status ${lastStatus.value}`
      );
      return OrchestratorResult.encode({ kind: "SKIPPED" });
    }

    // search a failure reason
    const findFailureReasonActivityResult = yield* findFailureReason(
      context,
      failedUserDataProcessing.choice,
      failedUserDataProcessing.fiscalCode
    );

    const failureReason = FindFailureReasonActivityResult.decode(
      findFailureReasonActivityResult
    )
      .map(a =>
        FindFailureReasonActivityResultSuccess.decode(a)
          .fold(__ => `Activity error ${a.kind}` as NonEmptyString, _ => _.value)
      )
      .fold(_ => "Cannot decode activity result", identity);

    // set a new failed status with reason
    yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
      currentRecord: failedUserDataProcessing,
      failureReason: failureReason,
      nextStatus: UserDataProcessingStatusEnum.FAILED
    });

    return OrchestratorResult.encode({ kind: "SUCCESS", type: "COMPLETED" });
  } catch (error) {
    context.log.error(
      `${logPrefix}|ERROR|Recovery failed for record ${
        failedUserDataProcessing.choice
      }-${failedUserDataProcessing.fiscalCode}: ${printableError(error)}`
    );

    return OrchestratorFailure.decode(error).getOrElse(
      UnhandledFailure.encode({
        kind: "UNHANDLED",
        reason: printableError(error)
      })
    );
  }
};
