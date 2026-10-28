import { odata, TableClient } from "@azure/data-tables";
import { InvocationContext } from "@azure/functions";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorInternal,
  ResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { TableEntityWithRowKey } from "../types/table";

type IHttpHandler = (
  context: InvocationContext,
  param: NonEmptyString
) => Promise<IResponseErrorInternal | IResponseSuccessJson<ResultSet>>;

type ResultSet = Readonly<{
  readonly failedDataProcessingUsers: readonly NonEmptyString[];
}>;

export const GetFailedUserDataProcessingListHandler =
  (tableClient: TableClient): IHttpHandler =>
  async (
    _ctx,
    choice
  ): Promise<IResponseErrorInternal | IResponseSuccessJson<ResultSet>> =>
    pipe(
      TE.tryCatch(async () => {
        const failedDataProcessingUsers: NonEmptyString[] = [];
        const pages = tableClient
          .listEntities<TableEntityWithRowKey<NonEmptyString>>({
            queryOptions: {
              filter: odata`PartitionKey eq ${choice}`,
              select: ["RowKey"]
            }
          })
          .byPage();

        for await (const page of pages) {
          // Azure Tables uses `RowKey`; the SDK exposes it as `rowKey` on
          // TableEntityResult: https://learn.microsoft.com/en-us/javascript/api/@azure/data-tables/tableentityresult?view=azure-node-latest
          failedDataProcessingUsers.push(...page.map(entity => entity.rowKey));
        }

        return { failedDataProcessingUsers };
      }, E.toError),
      TE.mapLeft(er => ResponseErrorInternal(er.message)),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();

export const GetFailedUserDataProcessingList = (tableClient: TableClient) => {
  const handler = GetFailedUserDataProcessingListHandler(tableClient);

  const middlewares = [
    ContextMiddleware(),
    RequiredParamMiddleware("choice", NonEmptyString)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
};
