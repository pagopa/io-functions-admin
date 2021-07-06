import {
  RetrievedServicePreference,
  ServicesPreferencesModel
} from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import * as te from "fp-ts/lib/TaskEither";
import * as e from "fp-ts/lib/Either";
import { Errors } from "io-ts";

/**
 * Extends ServicePreferencesModel with deleting operations
 */
export class ServicePreferencesDeletableModel extends ServicesPreferencesModel {
  public delete(
    documentId: NonEmptyString,
    fiscalCode: FiscalCode
  ): te.TaskEither<CosmosErrors, string> {
    return te
      .tryCatch(
        () => this.container.item(documentId, fiscalCode).delete(),
        toCosmosErrorResponse
      )
      .map(_ => _.item.id);
  }

  /**
   * Retrieves a list of every version of the requested model
   *
   * @param modelId
   */
  public findAllByFiscalCode(
    fiscalCode: FiscalCode
  ): AsyncIterator<
    ReadonlyArray<e.Either<Errors, RetrievedServicePreference>>
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
