import { IFunctionContext } from "durable-functions/lib/src/classes";
import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "../ExtractUserDataActivity/handler";
import { ActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess } from "../SendUserDataDownloadMessageActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";

const logPrefix = "";

// models the subset of UserDataProcessing documents that this orchestrator accepts
export type ProcessableUserDataProcessing = t.TypeOf<
  typeof ProcessableUserDataProcessing
>;
export const ProcessableUserDataProcessing = t.intersection([
  UserDataProcessing,
  t.interface({
    status: t.union([
      t.literal(UserDataProcessingStatusEnum.PENDING),
      t.literal(UserDataProcessingStatusEnum.FAILED)
    ])
  })
]);

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

export const handler = function*(
  context: IFunctionContext,
  document: unknown
): IterableIterator<unknown> {
  const invalidInputOrCurrentUserDataProcessing = ProcessableUserDataProcessing.decode(
    document
  ).mapLeft<InvalidInputFailure>(err => {
    context.log.error(
      `${logPrefix}|WARN|Cannot decode ProcessableUserDataProcessing document: ${readableReport(
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
    SetUserDataProcessingStatusActivityResultSuccess.decode(
      yield context.df.callActivity("setUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    ).getOrElseL(err => {
      throw ActivityFailure.encode({
        activityName: "setUserDataProcessingStatusActivity",
        extra: { status: UserDataProcessingStatusEnum.WIP },
        kind: "ACTIVITY",
        reason: readableReport(err)
      });
    });

    const bundle = ExtractUserDataActivityResultSuccess.decode(
      yield context.df.callActivity("extractUserDataActivity", {
        fiscalCode: currentUserDataProcessing.fiscalCode
      })
    ).getOrElseL(err => {
      throw ActivityFailure.encode({
        activityName: "extractUserDataActivity",
        kind: "ACTIVITY",
        reason: readableReport(err)
      });
    });

    SendUserDataDownloadMessageActivityResultSuccess.decode(
      yield context.df.callActivity("sendUserDataDownloadMessageActivity", {
        blobName: bundle.value.blobName,
        fiscalCode: currentUserDataProcessing.fiscalCode,
        password: bundle.value.password
      })
    ).getOrElseL(err => {
      throw ActivityFailure.encode({
        activityName: "sendUserDataDownloadMessageActivity",
        kind: "ACTIVITY",
        reason: readableReport(err)
      });
    });

    SetUserDataProcessingStatusActivityResultSuccess.decode(
      yield context.df.callActivity("setUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    ).getOrElseL(err => {
      throw ActivityFailure.encode({
        activityName: "setUserDataProcessingStatusActivity",
        extra: { status: UserDataProcessingStatusEnum.CLOSED },
        kind: "ACTIVITY",
        reason: readableReport(err)
      });
    });

    return OrchestratorSuccess.encode({ kind: "SUCCESS" });
  } catch (error) {
    SetUserDataProcessingStatusActivityResultSuccess.decode(
      yield context.df.callActivity("setUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    ).getOrElseL(err => {
      throw new Error(
        `Activity setUserDataProcessingStatusActivity (status=FAILED) failed: ${readableReport(
          err
        )}`
      );
    });

    return OrchestratorFailure.is(error)
      ? error
      : UnhanldedFailure.encode({ kind: "UNHANDLED", reason: error.message });
  }
};
