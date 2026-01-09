import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  IResponseErrorInternal,
  ResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ServiceResponse, TableQuery, TableService } from "azure-storage";
import express from "express";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

type IHttpHandler = (
  context: Context,
  param: NonEmptyString
) => Promise<IResponseErrorInternal | IResponseSuccessJson<ResultSet>>;

type ResultSet = Readonly<{
  readonly failedDataProcessingUsers: readonly NonEmptyString[];
}>;

type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: NonEmptyString;
  }>;
}>;

export const GetFailedUserDataProcessingListHandler =
  (
    tableService: TableService,
    failedUserDataProcessingTable: NonEmptyString
  ): IHttpHandler =>
  async (
    _ctx,
    choice
  ): Promise<IResponseErrorInternal | IResponseSuccessJson<ResultSet>> => {
    const tableQuery = new TableQuery()
      .select("RowKey")
      .where("PartitionKey == ?", choice);

    return pipe(
      TE.tryCatch(
        () =>
          new Promise<TableService.QueryEntitiesResult<TableEntry>>(
            (resolve, reject) =>
              tableService.queryEntities(
                failedUserDataProcessingTable,
                tableQuery,
                // TODO: Refactor for using the new `@azure/data-tables` library
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                null,
                (
                  error: Error,
                  result: TableService.QueryEntitiesResult<TableEntry>,
                  response: ServiceResponse
                ) => (response.isSuccessful ? resolve(result) : reject(error))
              )
          ),
        E.toError
      ),
      TE.map(rs => ({
        failedDataProcessingUsers: rs.entries.map(e => e.RowKey._)
      })),
      TE.mapLeft(er => ResponseErrorInternal(er.message)),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
  };

export const GetFailedUserDataProcessingList = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): express.RequestHandler => {
  const handler = GetFailedUserDataProcessingListHandler(
    tableService,
    failedUserDataProcessingTable
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("choice", NonEmptyString)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
