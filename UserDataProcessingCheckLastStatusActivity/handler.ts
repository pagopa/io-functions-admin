import { Context } from "@azure/functions";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatus } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { identity } from "fp-ts/lib/function";
import { fromEither, fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { getMessageFromCosmosErrors } from "../utils/conversions";

// Activity input
export const ActivityInput = t.interface({
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: UserDataProcessingStatus
});
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

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
  ActivityResultNotFoundFailure
]);
export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;

export const createUserDataProcessingCheckLastStatusActivityHandler = (
  userDataProcessingModel: UserDataProcessingModel
): ((context: Context, input: unknown) => Promise<ActivityResult>) => (
  _: Context,
  input: unknown
): Promise<ActivityResult> =>
  fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResultFailure>((reason: t.Errors) =>
      ActivityResultInvalidInputFailure.encode({
        kind: "INVALID_INPUT_FAILURE",
        reason: readableReport(reason)
      })
    )
    .chain(({ choice, fiscalCode }) =>
      userDataProcessingModel
        .findLastVersionByModelId([
          makeUserDataProcessingId(choice, fiscalCode),
          fiscalCode
        ])
        .foldTaskEither<ActivityResultFailure, UserDataProcessingStatus>(
          error =>
            fromLeft(
              ActivityResultQueryFailure.encode({
                kind: "QUERY_FAILURE",
                query: "findOneUserDataProcessingById",
                reason: `${error.kind}, ${getMessageFromCosmosErrors(error)}`
              })
            ),
          maybeRecord =>
            maybeRecord.fold(
              fromLeft(
                ActivityResultNotFoundFailure.encode({
                  kind: "NOT_FOUND_FAILURE"
                })
              ),
              r => taskEither.of(r.status)
            )
        )
    )
    .map(status =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: status
      })
    )
    .mapLeft(identity)
    .run()
    .then(e => e.value);
