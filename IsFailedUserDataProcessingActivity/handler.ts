import { Context } from "@azure/functions";
import { ServiceResponse, TableService } from "azure-storage";
import { fromOption } from "fp-ts/lib/Either";
import { NonEmptyString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { none, Option, some } from "fp-ts/lib/Option";
import * as t from "io-ts";
import { identity } from "fp-ts/lib/function";

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
  fromEither(ActivityInput.decode(input))
    .mapLeft<ActivityResult>(_ =>
      ActivityResultFailure.encode({
        kind: "FAILURE",
        reason: "Invalid input"
      })
    )
    .chain(i =>
      tryCatch(
        () =>
          new Promise<Option<TableEntry>>((resolve, reject) =>
            tableService.retrieveEntity(
              failedUserDataProcessingTable,
              i.choice,
              i.fiscalCode,
              null,
              (error: Error, result: TableEntry, response: ServiceResponse) =>
                response.isSuccessful
                  ? resolve(some(result))
                  : response.statusCode === 404
                  ? resolve(none)
                  : reject(error)
            )
          ),
        _ =>
          ActivityResultFailure.encode({
            kind: "FAILURE",
            reason: "ERROR|tableService.retrieveEntity|Cannot retrieve entity"
          })
      )
    )
    .chain(maybeTableEntry =>
      fromEither(
        fromOption(
          ActivityResultSuccess.encode({
            kind: "SUCCESS",
            value: false
          })
        )(maybeTableEntry)
      )
    )
    .map(_ =>
      ActivityResultSuccess.encode({
        kind: "SUCCESS",
        value: true
      })
    )
    .fold<ActivityResult>(identity, identity)
    .run();
