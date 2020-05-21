import * as DocumentDb from "documentdb";
import { Either } from "fp-ts/lib/Either";
import { MessageModel as MessageModelBase } from "io-functions-commons/dist/src/models/message";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import * as DocumentDbUtils from "../utils/documentdb";

export class MessageModel extends MessageModelBase {
  public async deleteMessage(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): Promise<Either<DocumentDb.QueryError, string>> {
    return DocumentDbUtils.deleteDocument(
      this.dbClient,
      this.collectionUri,
      messageId,
      fiscalCode
    );
  }
}
