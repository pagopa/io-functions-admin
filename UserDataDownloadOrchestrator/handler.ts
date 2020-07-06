import { IFunctionContext } from "durable-functions/lib/src/classes";
import { toString, identity } from "fp-ts/lib/function";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { UserDataProcessing } from "io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "../ExtractUserDataActivity/handler";
import { ActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess } from "../SendUserDataDownloadMessageActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";

import * as t from "io-ts";
import { left, right, isLeft, Either } from "fp-ts/lib/Either";

const logPrefix = "";

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

type OrchestratorFailure = t.TypeOf<typeof OrchestratorFailure>;
const OrchestratorFailure = t.taggedUnion("kind", [
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

type OrchestratorResult = t.TypeOf<typeof OrchestratorResult>;
const OrchestratorResult = t.union([
  OrchestratorFailure,
  SkippedDocument,
  OrchestratorSuccess
]);

export const handler = function*(
  context: IFunctionContext,
  documents: readonly unknown[]
): IterableIterator<unknown> {
  const document = documents[0];

  const earlyReturnOrCurrentUserDataProcessing = UserDataProcessing.decode(
    document
  )
    .mapLeft<OrchestratorResult>(err => {
      context.log.warn(
        `${logPrefix}|WARN|Cannot decode UserDataProcessing document: ${readableReport(
          err
        )}`
      );
      return InvalidInputFailure.encode({
        kind: "INVALID_INPUT",
        reason: readableReport(err)
      });
    })
    .fold<Either<OrchestratorResult, UserDataProcessing>>(left, decoded =>
      [
        // we are already working on it
        UserDataProcessingStatusEnum.WIP,
        // it's done already
        UserDataProcessingStatusEnum.CLOSED
      ].includes(decoded.status)
        ? left(SkippedDocument.encode({ kind: "SKIPPED" }))
        : right(decoded)
    );

  if (isLeft(earlyReturnOrCurrentUserDataProcessing)) {
    return earlyReturnOrCurrentUserDataProcessing.value;
  }

  const currentUserDataProcessing =
    earlyReturnOrCurrentUserDataProcessing.value;

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
