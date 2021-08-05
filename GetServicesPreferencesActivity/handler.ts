import { Context } from "@azure/functions";
import {
  ServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { isRight } from "fp-ts/lib/Either";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";

const ActivityInput = t.interface({
  fiscalCode: FiscalCode,
  settingsVersion: NonNegativeInteger
});
type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  preferences: t.readonlyArray(ServicePreference)
});

export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;

export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT")
});
export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  InvalidInputFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

export const GetServicesPreferencesActivityHandler = (
  servicePreferences: ServicesPreferencesModel
) => async (context: Context, input: unknown): Promise<ActivityResult> => {
  return fromEither<t.Errors, ActivityInput>(ActivityInput.decode(input))
    .mapLeft<InvalidInputFailure | CosmosErrors>(_ =>
      InvalidInputFailure.encode({ kind: "INVALID_INPUT" })
    )
    .chain(({ fiscalCode, settingsVersion }) =>
      tryCatch(
        async () =>
          servicePreferences
            .getQueryIterator({
              parameters: [
                {
                  name: "@fiscalCode",
                  value: fiscalCode
                },
                {
                  name: "@version",
                  value: settingsVersion
                }
              ],
              query: `SELECT * FROM m WHERE m.fiscalCode = @fiscalCode AND m.settingsVersion = @version`
            })
            [Symbol.asyncIterator](),
        toCosmosErrorResponse
      )
    )
    .map(flattenAsyncIterator)
    .map(asyncIteratorToArray)
    .chain(i => tryCatch(() => i, toCosmosErrorResponse))
    .map(values => values.filter(isRight).map(_ => _.value))
    .fold<ActivityResult>(
      err => {
        if (err.kind === "INVALID_INPUT") {
          context.log.error(
            `GetServicesPreferencesActivityHandler|ERROR|Invalid activity input [${err}]`
          );
          return err;
        }
        context.log.error(
          `GetServicesPreferencesActivityHandler|ERROR|Cosmos error [${
            err.kind === "COSMOS_DECODING_ERROR"
              ? readableReport(err.error)
              : err.kind === "COSMOS_ERROR_RESPONSE"
              ? err.error.message
              : err.kind
          }]`
        );
        throw new Error(err.kind);
      },
      preferences =>
        ActivityResultSuccess.encode({
          kind: "SUCCESS",
          preferences
        })
    )
    .run();
};
