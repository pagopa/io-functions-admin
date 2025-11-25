import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  IOrchestrationFunctionContext,
  RetryOptions
} from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "../ExtractUserDataActivity/handler";
import { ActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess } from "../SendUserDataDownloadMessageActivity/handler";
import { ActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess } from "../SetUserDataProcessingStatusActivity/handler";
import { ProcessableUserDataDownload } from "../UserDataProcessingTrigger/handler";
import {
  trackUserDataDownloadEvent,
  trackUserDataDownloadException
} from "../utils/appinsightsEvents";

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

const retryOptions = new RetryOptions(5000, 10);
// eslint-disable-next-line functional/immutable-data
retryOptions.backoffCoefficient = 1.5;

const toActivityFailure = (
  err: t.Errors,
  activityName: string,
  // eslint-disable-next-line @typescript-eslint/ban-types
  extra?: object
) =>
  ActivityFailure.encode({
    activityName,
    extra,
    kind: "ACTIVITY",
    reason: readableReport(err)
  });

export const handler = function* (
  context: IOrchestrationFunctionContext
): Generator<unknown> {
  const document = context.df.getInput();
  // This check has been done on the trigger, so it should never fail.
  // However, it's worth the effort to check it twice
  const invalidInputOrCurrentUserDataProcessing = pipe(
    document,
    ProcessableUserDataDownload.decode,
    E.mapLeft(err => {
      context.log.error(
        `${logPrefix}|WARN|Cannot decode ProcessableUserDataDownload document: ${readableReport(
          err
        )}`
      );
      return InvalidInputFailure.encode({
        kind: "INVALID_INPUT",
        reason: readableReport(err)
      });
    })
  );

  if (E.isLeft(invalidInputOrCurrentUserDataProcessing)) {
    return invalidInputOrCurrentUserDataProcessing.left;
  }

  const currentUserDataProcessing =
    invalidInputOrCurrentUserDataProcessing.right;

  try {
    pipe(
      yield context.df.callActivityWithRetry(
        "SetUserDataProcessingStatusActivity",
        retryOptions,
        {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.WIP
        }
      ),
      SetUserDataProcessingStatusActivityResultSuccess.decode,
      E.getOrElseW(err => {
        throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
          status: UserDataProcessingStatusEnum.WIP
        });
      })
    );

    const bundle = pipe(
      yield context.df.callActivity("ExtractUserDataActivity", {
        fiscalCode: currentUserDataProcessing.fiscalCode
      }),
      ExtractUserDataActivityResultSuccess.decode,
      E.mapLeft(err => {
        throw toActivityFailure(err, "ExtractUserDataActivity");
      }),
      E.toUnion
    );

    pipe(
      yield context.df.callActivityWithRetry(
        "SendUserDataDownloadMessageActivity",
        new RetryOptions(5000, 10),
        {
          blobName: bundle.value.blobName,
          fiscalCode: currentUserDataProcessing.fiscalCode,
          password: bundle.value.password
        }
      ),
      SendUserDataDownloadMessageActivityResultSuccess.decode,
      E.getOrElseW(err => {
        throw toActivityFailure(err, "SendUserDataDownloadMessageActivity");
      })
    );

    pipe(
      yield context.df.callActivityWithRetry(
        "SetUserDataProcessingStatusActivity",
        retryOptions,
        {
          currentRecord: currentUserDataProcessing,
          nextStatus: UserDataProcessingStatusEnum.CLOSED
        }
      ),
      SetUserDataProcessingStatusActivityResultSuccess.decode,
      E.getOrElseW(err => {
        throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
          status: UserDataProcessingStatusEnum.CLOSED
        });
      })
    );

    trackUserDataDownloadEvent("done", currentUserDataProcessing);

    return OrchestratorSuccess.encode({ kind: "SUCCESS" });
  } catch (error) {
    trackUserDataDownloadException(
      "failed",
      E.toError(error),
      currentUserDataProcessing,
      context,
      false
    );

    context.log.error(`${logPrefix}|ERROR|${JSON.stringify(error)}`);

    const orchestrationFailure = pipe(
      error,
      OrchestratorFailure.decode,
      E.getOrElseW(() =>
        UnhanldedFailure.encode({
          kind: "UNHANDLED",
          reason: JSON.stringify(error)
        })
      )
    );

    const failureReason = `${orchestrationFailure.kind}${
      orchestrationFailure.kind === "ACTIVITY"
        ? `(${orchestrationFailure.activityName})`
        : ""
    }|${orchestrationFailure.reason}`;

    pipe(
      yield context.df.callActivityWithRetry(
        "SetUserDataProcessingStatusActivity",
        retryOptions,
        {
          currentRecord: currentUserDataProcessing,
          failureReason,
          nextStatus: UserDataProcessingStatusEnum.FAILED
        }
      ),
      SetUserDataProcessingStatusActivityResultSuccess.decode,
      E.getOrElseW(err => {
        trackUserDataDownloadException(
          "unhandled_failed_status",
          new Error(readableReport(err)),
          currentUserDataProcessing,
          context,
          false
        );

        throw new Error(
          `Activity SetUserDataProcessingStatusActivity (status=FAILED) failed: ${readableReport(
            err
          )}`
        );
      })
    );

    return orchestrationFailure;
  }
};
