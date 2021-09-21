import { Context } from "@azure/functions";
import { ServiceResponse, TableService } from "azure-storage";
import { NonEmptyString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";
import { pipe } from "fp-ts/lib/function";

// Activity input
export const ActivityInput = t.interface({
  choice: UserDataProcessingChoice,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

// Activity result
export type ActivityResultSuccess = t.TypeOf<typeof ActivityResultSuccess>;
export const ActivityResultSuccess = t.interface({
  kind: t.literal("SUCCESS"),
  value: t.boolean
});

export type ActivityResultFailure = t.TypeOf<typeof ActivityResultFailure>;
export const ActivityResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

export const ActivityResult = t.taggedUnion("kind", [
  ActivityResultSuccess,
  ActivityResultFailure
]);
export type ActivityResult = t.TypeOf<typeof ActivityResult>;

// Table storage result
type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: FiscalCode;
  }>;
}>;

export const IsFailedUserDataProcessing = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
) => (context: Context, input: unknown): Promise<ActivityResult> =>
  pipe(
    input,
    ActivityInput.decode,
    E.mapLeft(_ =>
      ActivityResultFailure.encode({
        kind: "FAILURE",
        reason: "Invalid input"
      })
    ),
    TE.fromEither,
    TE.chainW(i =>
      TE.tryCatch(
        () =>
          new Promise<O.Option<TableEntry>>((resolve, reject) =>
            tableService.retrieveEntity(
              failedUserDataProcessingTable,
              i.choice,
              i.fiscalCode,
              null,
              (error: Error, result: TableEntry, response: ServiceResponse) =>
                response.isSuccessful
                  ? resolve(O.some(result))
                  : response.statusCode === 404
                  ? resolve(O.none)
                  : reject(error)
            )
          ),
        _ =>
          ActivityResultFailure.encode({
            kind: "FAILURE",
            reason: "ERROR|tableService.retrieveEntity|Cannot retrieve entity"
          })
      )
    ),
    TE.chainW(
      TE.fromOption(() =>
        ActivityResultSuccess.encode({
          kind: "SUCCESS",
          value: false
        })
      )
    ),
    TE.map(_ =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: true
      })
    ),
    TE.toUnion
  )();
