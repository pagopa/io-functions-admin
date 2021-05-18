import * as express from "express";

import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
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
import { fromOption, toError } from "fp-ts/lib/Either";
import { NonEmptyString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import { none, Option, some } from "fp-ts/lib/Option";
import { ResponseErrorNotFound } from "@pagopa/ts-commons/lib/responses";

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
  userAttrs: IAzureUserAttributes,
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
  __,
  choice,
  fiscalCode
): Promise<
  | IResponseSuccessJson<ResultSet>
  | IResponseErrorInternal
  | IResponseErrorNotFound
> =>
  tryCatch(
    () =>
      new Promise<Option<TableEntry>>((resolve, reject) =>
        tableService.retrieveEntity(
          failedUserDataProcessingTable,
          choice,
          fiscalCode,
          null,
          (error: Error, result: TableEntry, response: ServiceResponse) =>
            response.isSuccessful
              ? resolve(some(result))
              : response.statusCode === 404
              ? resolve(none)
              : reject(error)
        )
      ),
    toError
  )
    .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(er =>
      ResponseErrorInternal(er.message)
    )
    .chain(maybeTableEntry =>
      fromEither(
        fromOption(ResponseErrorNotFound("Not found!", "No record found."))(
          maybeTableEntry
        )
      )
    )
    .map(rs => ({
      failedDataProcessingUser: rs.RowKey._
    }))
    .fold<
      | IResponseSuccessJson<ResultSet>
      | IResponseErrorInternal
      | IResponseErrorNotFound
    >(er => er, ResponseSuccessJson)
    .run();

export const GetFailedUserDataProcessing = (
  serviceModel: ServiceModel,
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): express.RequestHandler => {
  const handler = GetFailedUserDataProcessingHandler(
    tableService,
    failedUserDataProcessingTable
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
