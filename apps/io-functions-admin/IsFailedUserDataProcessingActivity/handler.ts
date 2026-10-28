import { TableClient } from "@azure/data-tables";
import { InvocationContext } from "@azure/functions";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/v2/UserDataProcessingChoice";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";

import { getTableStorageStatusCode } from "../utils/storage";

export const ActivityName = "IsFailedUserDataProcessingActivity";

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

export const IsFailedUserDataProcessing =
  (tableClient: TableClient) =>
  (input: unknown, _context: InvocationContext): Promise<ActivityResult> =>
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
          async () => {
            try {
              await tableClient.getEntity(i.choice, i.fiscalCode);
              return true;
            } catch (error) {
              if (getTableStorageStatusCode(error) === 404) {
                return false;
              }
              throw error;
            }
          },
          _ =>
            ActivityResultFailure.encode({
              kind: "FAILURE",
              reason: "ERROR|tableService.retrieveEntity|Cannot retrieve entity"
            })
        )
      ),
      TE.map(value =>
        ActivityResultSuccess.encode({
          kind: "SUCCESS",
          value
        })
      ),
      TE.toUnion
    )();
