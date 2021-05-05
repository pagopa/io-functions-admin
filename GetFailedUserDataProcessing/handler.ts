import * as express from "express";

import { Context } from "@azure/functions";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseSuccessJson,
  ResponseSuccessJson,
  IResponseErrorInternal,
  ResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { ServiceResponse, TableService } from "azure-storage";
import { toError } from "fp-ts/lib/Either";
import { NonEmptyString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UserDataProcessingChoice } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { tryCatch } from "fp-ts/lib/TaskEither";

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
) => Promise<IResponseSuccessJson<ResultSet> | IResponseErrorInternal>;

export const GetFailedUserDataProcessingHandler = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): IHttpHandler => async (
  _,
  __,
  choice,
  fiscalCode
): Promise<IResponseSuccessJson<ResultSet> | IResponseErrorInternal> =>
  tryCatch(
    () =>
      new Promise<TableEntry>((resolve, reject) =>
        tableService.retrieveEntity(
          failedUserDataProcessingTable,
          choice,
          fiscalCode,
          null,
          (error: Error, result: TableEntry, response: ServiceResponse) =>
            response.isSuccessful ? resolve(result) : reject(error)
        )
      ),
    toError
  )
    .map(rs => ({
      failedDataProcessingUser: rs.RowKey._
    }))
    .fold<IResponseSuccessJson<ResultSet> | IResponseErrorInternal>(
      er => ResponseErrorInternal(er.message),
      ResponseSuccessJson
    )
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
