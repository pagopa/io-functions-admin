import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import {
  PROFILE_MODEL_PK_FIELD,
  ProfileModel as ProfileModelBase,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import * as DocumentDbUtils from "../documentdb";

/**
 * Extends ProfileModel with deleting operations
 */
export class ProfileDeletableModel extends ProfileModelBase {
  public deleteProfileVersion(
    fiscalCode: FiscalCode,
    documentId: NonEmptyString
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
  public findAllVersionsByModelId(
    fiscalCode: FiscalCode
  ): AsyncIterator<ReadonlyArray<E.Either<Errors, RetrievedProfile>>> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.container,
      this.retrievedItemT,
      PROFILE_MODEL_PK_FIELD,
      fiscalCode,
      PROFILE_MODEL_PK_FIELD,
      fiscalCode
    )[Symbol.asyncIterator]();
  }
}
