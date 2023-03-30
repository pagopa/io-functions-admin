import type * as activities from "./activities/activities";
import { proxyActivities } from "@temporalio/workflow";
import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { Context } from "@azure/functions";
import { flow, pipe } from "fp-ts/lib/function";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import { ActivityResultSuccess as ExtractUserDataActivityResultSuccess } from "./activities/types";
import { SetUserDataActivityResultSuccess as SetUserDataProcessingStatusActivityResultSuccess} from "./activities/types";
import { SetUserDataActivityResultSuccess as SendUserDataDownloadMessageActivityResultSuccess} from "./activities/types";
// import { trackUserDataDownloadEvent, trackUserDataDownloadException } from "../utils/appinsightsEvents";

const logPrefixDownloadOrch = "UserDataDownloadOrchestrator";

// retry options
const {
  setUserDataProcessingStatusActivity,
  extractUserDataActivity,
  sendUserDataDownloadMessageActivity,
  ProcessableDownloadDecodeActivity
} = proxyActivities<typeof activities>({
  retry: {
    maximumAttempts: 10,
    initialInterval: 5000,
    backoffCoefficient: 1.5
  },
  startToCloseTimeout: "2m"
});




export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;
export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT"),
  reason: t.string
});

export type UnhandledFailure = t.TypeOf<typeof UnhanldedFailure>;
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
    err: t.Errors | Error,
    activityName: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    extra?: object
  ) =>
  ActivityFailure.encode({
    activityName,
    extra,
    kind: "ACTIVITY",
    reason: err instanceof Error? err.message:readableReport(err)
  });

export const userDataDownloadWorkflow = async (
  inputDocument: unknown,
  azureContext: Context
): Promise<
  InvalidInputFailure | UnhandledFailure | ActivityFailure | OrchestratorSuccess
> => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  
  // This check has been done on the trigger, so it should never fail.
  // However, it's worth the effort to check it twice
  const invalidInputOrCurrentUserDataProcessing = await ProcessableDownloadDecodeActivity(inputDocument,azureContext);

  if (E.isLeft(invalidInputOrCurrentUserDataProcessing)) {
    return invalidInputOrCurrentUserDataProcessing.left as InvalidInputFailure;
  }

  const currentUserDataProcessing =
    invalidInputOrCurrentUserDataProcessing.right;

  try {
    await pipe(
      // DURABLE FUNCTION OLD CODE
      // callActivityWithRetry(
      //   "SetUserDataProcessingStatusActivity",
      //   retryOptions,
      //   {
      //     currentRecord: currentUserDataProcessing,
      //     nextStatus: UserDataProcessingStatusEnum.WIP
      //   }
      // ),
      TE.tryCatch(
        () =>
          setUserDataProcessingStatusActivity({
            currentRecord: currentUserDataProcessing,
            nextStatus: UserDataProcessingStatusEnum.WIP
          }),
        E.toError
      ),
      TE.chainW(
        flow(
          SetUserDataProcessingStatusActivityResultSuccess.decode,
          TE.fromEither
        )
      ),
      TE.getOrElse(err => {
        throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
          status: UserDataProcessingStatusEnum.WIP
        });
      })
    )();


    const bundle = await pipe(
      TE.tryCatch(
        () =>
          extractUserDataActivity({
            input: { fiscalCode: currentUserDataProcessing.fiscalCode},context: azureContext
          }),
        E.toError
      ),
      TE.chainW(
        flow(ExtractUserDataActivityResultSuccess.decode, TE.fromEither)
      ),
      TE.mapLeft(err => {
        throw toActivityFailure(err, "ExtractUserDataActivity");
      }),
      TE.toUnion
    )();


    await pipe(
      // DURABLE FUNCTION OLD CODE
      // context.df.callActivityWithRetry(
      //   "SendUserDataDownloadMessageActivity",
      //   new RetryOptions(5000, 10),
      //   {
      //     blobName: bundle.value.blobName,
      //     fiscalCode: currentUserDataProcessing.fiscalCode,
      //     password: bundle.value.password
      //   }
      // ),
      TE.tryCatch(
        () =>
          sendUserDataDownloadMessageActivity({
            blobName: bundle.value.blobName,
            fiscalCode: currentUserDataProcessing.fiscalCode,
            password: bundle.value.password
          },azureContext),
        E.toError
      ),
      TE.chainW(
        flow(
          SendUserDataDownloadMessageActivityResultSuccess.decode,
          TE.fromEither
        )
      ),
      TE.getOrElse(err => {
        throw toActivityFailure(err, "SendUserDataDownloadMessageActivity");
      })
    )();


    await pipe(
      // DURABLE FUNCTION OLD CODE
      // context.df.callActivityWithRetry(
      //   "SetUserDataProcessingStatusActivity",
      //   retryOptions,
      //   {
      //     currentRecord: currentUserDataProcessing,
      //     nextStatus: UserDataProcessingStatusEnum.CLOSED
      //   }
      // ),
      TE.tryCatch(
        () =>
          setUserDataProcessingStatusActivity({
            currentRecord: currentUserDataProcessing,
            nextStatus: UserDataProcessingStatusEnum.CLOSED
          }),
        E.toError
      ),
      TE.chainW(
        flow(
          SetUserDataProcessingStatusActivityResultSuccess.decode,
          TE.fromEither
        )
      ),
      // TOFIX
      TE.getOrElse(err => {
        throw toActivityFailure(err, "SetUserDataProcessingStatusActivity", {
          status: UserDataProcessingStatusEnum.CLOSED
        });
      })
    )();

    // TOFIX
    // trackUserDataDownloadEvent("done", currentUserDataProcessing);

    return OrchestratorSuccess.encode({ kind: "SUCCESS" });
  } catch (error) {
    // TOFIX
    // trackUserDataDownloadException(
    //   "failed",
    //   E.toError(error),
    //   currentUserDataProcessing
    // );

    // azureContext.log.error(`${logPrefixDownloadOrch}|ERROR|${JSON.stringify(error)}`);

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

    await pipe(
      // DURABLE FUNCTION OLD CODE
      // context.df.callActivityWithRetry(
      //   "SetUserDataProcessingStatusActivity",
      //   retryOptions,
      //   {
      //     currentRecord: currentUserDataProcessing,
      //     failureReason,
      //     nextStatus: UserDataProcessingStatusEnum.FAILED
      //   }
      // ),
      TE.tryCatch(
        () =>
          setUserDataProcessingStatusActivity({
            currentRecord: currentUserDataProcessing,
            failureReason,
            nextStatus: UserDataProcessingStatusEnum.FAILED
          }),
        E.toError
      ),
      TE.chainW(
        flow(
          SetUserDataProcessingStatusActivityResultSuccess.decode,
          TE.fromEither
        )
      ),
      // TODO: fix
      TE.getOrElse(err => {

        const formattedError=err instanceof Error? err.message: readableReport(err);
        // trackUserDataDownloadException(
        //   "unhandled_failed_status",
        //   new Error(formattedError),
        //   currentUserDataProcessing
        // );

        throw new Error(
          `Activity SetUserDataProcessingStatusActivity (status=FAILED) failed: ${formattedError}`
        );
      })
    )();

    return orchestrationFailure;
  }
};
