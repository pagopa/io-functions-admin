import { Context } from "@azure/functions";
import * as df from "durable-functions";
import { makeOrchestratorId as makeDeleteOrchestratorId } from "../UserDataDeleteOrchestrator/utils";
import { makeOrchestratorId as makeDownloadOrchestratorId } from "../UserDataDownloadOrchestrator/utils";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { OrchestratorResult } from "../UserDataProcessingRecoveryOrchestrator/handler";
import { identity, toString } from "fp-ts/lib/function";
import { DurableOrchestrationStatus } from "durable-functions/lib/src/durableorchestrationstatus";
import { fromNullable } from "fp-ts/lib/Either";

// Activity input
export const ActivityInput = t.interface({
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity failed because of invalid input
export const ActivityResultInvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT_FAILURE"),
  reason: t.string
});
export type ActivityResultInvalidInputFailure = t.TypeOf<
  typeof ActivityResultInvalidInputFailure
>;

// Activity failed because of invalid input
export const ActivityResultNotFoundFailure = t.interface({
  kind: t.literal("NOT_FOUND_FAILURE")
});
export type ActivityResultNotFoundFailure = t.TypeOf<
  typeof ActivityResultNotFoundFailure
>;

// Activity failed because of invalid input
export const ActivityResultUnhandledFailure = t.interface({
  kind: t.literal("UNHANDLED"),
  reason: t.string
});
export type ActivityResultUnhandledFailure = t.TypeOf<
  typeof ActivityResultUnhandledFailure
>;

// Activity failed because of an error on a query
export const ActivityResultQueryFailure = t.intersection([
  t.interface({
    kind: t.literal("QUERY_FAILURE"),
    reason: t.string
  }),
  t.partial({ query: t.string })
]);
export type ActivityResultQueryFailure = t.TypeOf<
  typeof ActivityResultQueryFailure
>;

export const ActivityResultFailure = t.taggedUnion("kind", [
  ActivityResultQueryFailure,
  ActivityResultInvalidInputFailure,
  ActivityResultNotFoundFailure,
  ActivityResultUnhandledFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: NonEmptyString
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

export const getFindFailureReasonActivityHandler = async (
  context: Context,
  input: unknown
): Promise<ActivityResult> => {
  const client = df.getClient(context);

  return fromEither(ActivityInput.decode(input))
    .mapLeft(_ => {
      return ActivityResultFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: "Input not valid for this activity"
      });
    })
    .chain(({ choice, fiscalCode }) => {
      // create failed orchestrator id based on choice
      const failedUserDataProcessingOrchestratorId =
        choice == UserDataProcessingChoiceEnum.DELETE
          ? makeDeleteOrchestratorId(fiscalCode)
          : makeDownloadOrchestratorId(fiscalCode);

      return tryCatch(
        () => {
          // get the status of the failed orchestrator
          return client.getStatus(failedUserDataProcessingOrchestratorId);
        },
        () => {
          return ActivityResultFailure.encode({
            kind: "NOT_FOUND_FAILURE"
          });
        }
      );
    })
    .fold(identity, orchestratorStatus => {
      return fromNullable("No reason found")(orchestratorStatus.output)
        .map(o =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: o as NonEmptyString
          })
        )
        .mapLeft(e =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: e as NonEmptyString
          })
        )
        .fold<ActivityResult>(identity, identity);
    })
    .run();
};
