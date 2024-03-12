import * as express from "express";
import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson,
  IResponseErrorInternal,
  ResponseErrorInternal,
  IResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { ServiceResponse, TableService } from "azure-storage";
import { NonEmptyString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import { ResponseErrorNotFound } from "@pagopa/ts-commons/lib/responses";
import { flow, pipe } from "fp-ts/lib/function";

type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: FiscalCode;
  }>;
}>;

type ResultSet = Readonly<{
  readonly failedDataProcessingUser: FiscalCode;
}>;

type IHttpHandler = (
  context: Context,
  param1: UserDataProcessingChoice,
  param2: FiscalCode
) => Promise<
  | IResponseSuccessJson<ResultSet>
  | IResponseErrorInternal
  | IResponseErrorNotFound
>;

export const GetFailedUserDataProcessingHandler = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): IHttpHandler => async (
  _,
  choice,
  fiscalCode
): Promise<
  | IResponseSuccessJson<ResultSet>
  | IResponseErrorInternal
  | IResponseErrorNotFound
> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<O.Option<TableEntry>>((resolve, reject) =>
          tableService.retrieveEntity(
            failedUserDataProcessingTable,
            choice,
            fiscalCode,
            // TODO: Refactor for using the new `@azure/data-tables` library
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            null,
            (error: Error, result: TableEntry, response: ServiceResponse) =>
              response.isSuccessful
                ? resolve(O.some(result))
                : response.statusCode === 404
                ? resolve(O.none)
                : reject(error)
          )
        ),
      E.toError
    ),
    TE.mapLeft(er => ResponseErrorInternal(er.message)),
    TE.chainW(
      flow(
        TE.fromOption(() =>
          ResponseErrorNotFound("Not found!", "No record found.")
        ),
        TE.map(rs => ({
          failedDataProcessingUser: rs.RowKey._
        }))
      )
    ),
    TE.map(ResponseSuccessJson),
    TE.toUnion
  )();

export const GetFailedUserDataProcessing = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): express.RequestHandler => {
  const handler = GetFailedUserDataProcessingHandler(
    tableService,
    failedUserDataProcessingTable
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
