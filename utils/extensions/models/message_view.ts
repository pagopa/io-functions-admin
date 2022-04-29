import * as TE from "fp-ts/lib/TaskEither";
import { MessageViewModel as MessageViewModelBase } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";

/**
 * Extends MessageViewModel with deleting operations
 */
export class MessageViewDeletableModel extends MessageViewModelBase {
  public deleteMessageView(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): TE.TaskEither<CosmosErrors, string> {
    return pipe(
      TE.tryCatch(
        () => this.container.item(messageId, fiscalCode).delete(),
        toCosmosErrorResponse
      ),
      TE.map(_ => _.item.id)
    );
  }
}
