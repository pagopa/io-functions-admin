import { Either } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import {
  PROFILE_MODEL_PK_FIELD,
  ProfileModel as ProfileModelBase,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../documentdb";

/**
 * Extends ProfileModel with deleting operations
 */
export class ProfileDeletableModel extends ProfileModelBase {
  public deleteProfileVersion(
    fiscalCode: FiscalCode,
    documentId: NonEmptyString
  ): TaskEither<CosmosErrors, string> {
    return tryCatch(
      () => this.container.item(documentId, fiscalCode).delete(),
      toCosmosErrorResponse
    ).map(_ => _.item.id);
  }

  /**
   * Retrieves a list of every version of the requested model
   *
   * @param modelId
   */
  public findAllVersionsByModelId(
    fiscalCode: FiscalCode
  ): AsyncIterator<ReadonlyArray<Either<Errors, RetrievedProfile>>> {
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
