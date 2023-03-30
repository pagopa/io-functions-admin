import { Context } from "@azure/functions";
import * as df from "durable-functions";
import {
  UserDataProcessingChoice,
  UserDataProcessingChoiceEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as t from "io-ts";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import { makeOrchestratorId as makeDeleteOrchestratorId } from "../UserDataDeleteOrchestratorV2/utils";

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
): Promise<ActivityResult> =>
  pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(_ =>
      ActivityResultFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: "Input not valid for this activity"
      })
    ),
    TE.chain(({ choice, fiscalCode }) => {
      // create failed orchestrator id based on choice
      const failedUserDataProcessingOrchestratorId =
        choice === UserDataProcessingChoiceEnum.DELETE
          ? makeDeleteOrchestratorId(fiscalCode)
          : fiscalCode;

      return TE.tryCatch(
        () =>
          // get the status of the failed orchestrator
          df
            .getClient(context)
            .getStatus(failedUserDataProcessingOrchestratorId),
        () =>
          ActivityResultFailure.encode({
            kind: "NOT_FOUND_FAILURE"
          })
      );
    }),
    TE.map(orchestratorStatus =>
      pipe(
        orchestratorStatus.output,
        E.fromNullable("No reason found"),
        E.map(o =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: JSON.stringify(o, (_, value) => value) as NonEmptyString
          })
        ),
        E.mapLeft(e =>
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: JSON.stringify(e, (_, value) => value) as NonEmptyString
          })
        ),
        E.toUnion
      )
    ),
    TE.toUnion
  )();
