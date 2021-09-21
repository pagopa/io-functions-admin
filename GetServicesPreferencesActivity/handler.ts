import { Context } from "@azure/functions";
import {
  ServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
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
) => async (context: Context, input: unknown): Promise<ActivityResult> =>
  pipe(
    input,
    ActivityInput.decode,
    E.mapLeft(_ => InvalidInputFailure.encode({ kind: "INVALID_INPUT" })),
    TE.fromEither,
    TE.chainW(({ fiscalCode, settingsVersion }) =>
      TE.tryCatch(
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
    ),
    TE.map(flattenAsyncIterator),
    TE.map(asyncIteratorToArray),
    TE.chainW(i => TE.tryCatch(() => i, toCosmosErrorResponse)),
    TE.map(values => values.filter(E.isRight).map(_ => _.right)),
    TE.mapLeft(err => {
      if (err.kind === "INVALID_INPUT") {
        context.log.error(
          `GetServicesPreferencesActivityHandler|ERROR|Invalid activity input [${err}]`
        );
        return err;
      }
      context.log.error(
        `GetServicesPreferencesActivityHandler|ERROR|Cosmos error [${err.error.message}]`
      );
      throw new Error(err.kind);
    }),
    TE.map(preferences =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        preferences
      })
    ),
    TE.toUnion
  )();
