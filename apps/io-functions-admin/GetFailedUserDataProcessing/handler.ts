import { InvocationContext } from "@azure/functions";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { ResponseErrorNotFound } from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ServiceResponse, TableService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

type IHttpHandler = (
  context: InvocationContext,
  param1: UserDataProcessingChoice,
  param2: FiscalCode
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseSuccessJson<ResultSet>
>;

type ResultSet = Readonly<{
  readonly failedDataProcessingUser: FiscalCode;
}>;

type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: FiscalCode;
  }>;
}>;

export const GetFailedUserDataProcessingHandler =
  (
    tableService: TableService,
    failedUserDataProcessingTable: NonEmptyString
  ): IHttpHandler =>
  async (
    _,
    choice,
    fiscalCode
  ): Promise<
    | IResponseErrorInternal
    | IResponseErrorNotFound
    | IResponseSuccessJson<ResultSet>
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
) => {
  const handler = GetFailedUserDataProcessingHandler(
    tableService,
    failedUserDataProcessingTable
  );

  const middlewares = [
    ContextMiddleware(),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
};
