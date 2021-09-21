import {
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import { Errors } from "io-ts";
import { pipe } from "fp-ts/lib/function";

/**
 * Extends ServicePreferencesModel with deleting operations
 */
export class ServicePreferencesDeletableModel extends ServicesPreferencesModel {
  public delete(
    documentId: NonEmptyString,
    fiscalCode: FiscalCode
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(documentId, fiscalCode).delete(),
        toCosmosErrorResponse
      ),
      TE.map(_ => _.item.id)
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   *
   * @param modelId
   */
  public findAllByFiscalCode(
    fiscalCode: FiscalCode
  ): AsyncIterator<
    ReadonlyArray<E.Either<Errors, RetrievedServicePreference>>
  > {
    return this.getQueryIterator({
      parameters: [
        {
          name: "@fiscalCode",
          value: fiscalCode
        }
      ],
      query: `SELECT * FROM sp WHERE sp.fiscalCode = @fiscalCode`
    })[Symbol.asyncIterator]();
  }
}
