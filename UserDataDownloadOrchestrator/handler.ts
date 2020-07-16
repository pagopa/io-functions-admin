import {
  IFunctionContext,
  RetryOptions
} from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "../ExtractUserDataActivity/handler";
import { ActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess } from "../SendUserDataDownloadMessageActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";
import { ProcessableUserDataDownload } from "../UserDataProcessingTrigger";
import { trackEvent, trackException } from "../utils/appinsights";

const logPrefix = "UserDataDownloadOrchestrator";

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

export const handler = function*(
  context: IFunctionContext
): IterableIterator<unknown> {
  const document = context.df.getInput();
  // This check has been done on the trigger, so it should never fail.
  // However, it's worth the effort to check it twice
  const invalidInputOrCurrentUserDataProcessing = ProcessableUserDataDownload.decode(
    document
  ).mapLeft<InvalidInputFailure>(err => {
    context.log.error(
      `${logPrefix}|WARN|Cannot decode ProcessableUserDataDownload document: ${readableReport(
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
      yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.WIP
      })
    ).getOrElseL(err => {
      throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
        status: UserDataProcessingStatusEnum.WIP
      });
    });

    const bundle = ExtractUserDataActivityResultSuccess.decode(
      yield context.df.callActivity("ExtractUserDataActivity", {
        fiscalCode: currentUserDataProcessing.fiscalCode
      })
    ).getOrElseL(err => {
      throw toActivityFailure(err, "ExtractUserDataActivity");
    });

    SendUserDataDownloadMessageActivityResultSuccess.decode(
      yield context.df.callActivityWithRetry(
        "SendUserDataDownloadMessageActivity",
        new RetryOptions(5000, 10),
        {
          blobName: bundle.value.blobName,
          fiscalCode: currentUserDataProcessing.fiscalCode,
          password: bundle.value.password
        }
      )
    ).getOrElseL(err => {
      throw toActivityFailure(err, "SendUserDataDownloadMessageActivity");
    });

    SetUserDataProcessingStatusActivityResultSuccess.decode(
      yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    ).getOrElseL(err => {
      throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
        status: UserDataProcessingStatusEnum.CLOSED
      });
    });

    trackEvent({
      // tslint:disable-next-line: no-duplicate-string
      name: "user.data.download",
      properties: {
        userDataProcessingId: currentUserDataProcessing.userDataProcessingId
      },
      tagOverrides: {
        "ai.operation.id": currentUserDataProcessing.userDataProcessingId,
        "ai.operation.parentId": currentUserDataProcessing.userDataProcessingId
      }
    });

    return OrchestratorSuccess.encode({ kind: "SUCCESS" });
  } catch (error) {
    trackException({
      exception: new Error(error),
      properties: {
        name: "user.data.download",
        userDataProcessingId: currentUserDataProcessing.userDataProcessingId
      }
    });
    context.log.error(
      `${logPrefix}|ERROR|Failed processing user data for download: ${error.message}`
    );
    SetUserDataProcessingStatusActivityResultSuccess.decode(
      yield context.df.callActivity("SetUserDataProcessingStatusActivity", {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.FAILED
      })
    ).getOrElseL(err => {
      trackException({
        exception: new Error(readableReport(err)),
        properties: {
          name: "user.data.download",
          type: "unhandled exception when trying to set document as FAILED",
          userDataProcessingId: currentUserDataProcessing.userDataProcessingId
        }
      });
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
