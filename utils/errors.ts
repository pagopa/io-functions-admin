import { pipe } from "fp-ts/lib/function";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { errorsToReadableMessages } from "@pagopa/ts-commons/lib/reporters";

export const cosmosErrorsToString = (errs: CosmosErrors): NonEmptyString =>
  pipe(
    errs.kind === "COSMOS_EMPTY_RESPONSE"
      ? "Empty response"
      : errs.kind === "COSMOS_DECODING_ERROR"
      ? "Decoding error: " + errorsToReadableMessages(errs.error).join("/")
      : errs.kind === "COSMOS_CONFLICT_RESPONSE"
      ? "Conflict error"
      : "Generic error: " + JSON.stringify(errs.error),

    errorString => errorString as NonEmptyString
  );
