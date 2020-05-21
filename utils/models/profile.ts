import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import {
  PROFILE_MODEL_PK_FIELD,
  ProfileModel as ProfileModelBase,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../documentdb";

export class ProfileModel extends ProfileModelBase {
  public async deleteProfileVersion(
    fiscalCode: FiscalCode,
    documentId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      documentId,
      fiscalCode
    );
  }

  /**
   * Retrieves a list of every version of the requested model
   * @param modelId
   */
  public findAllVersionsByModelId(
    fiscalCode: FiscalCode
  ): DocumentDbUtils.IResultIterator<RetrievedProfile> {
    return DocumentDbUtils.findAllVersionsByModelId(
      this.dbClient,
      this.collectionUri,
      PROFILE_MODEL_PK_FIELD,
      fiscalCode,
      PROFILE_MODEL_PK_FIELD,
      fiscalCode
    );
  }
}
