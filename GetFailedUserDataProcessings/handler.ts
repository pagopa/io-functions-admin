import * as express from "express";
import * as t from "io-ts";

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
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { ServiceResponse, TableQuery, TableService } from "azure-storage";
import { Either, left, right } from "fp-ts/lib/Either";
import {
  IResponseErrorInternal,
  ResponseErrorInternal
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

type TableEntry = Readonly<{
  readonly RowKey: Readonly<{
    readonly _: NonEmptyString;
  }>;
}>;

type ResultSet = Readonly<{
  readonly failedDataProcessingUsers: ReadonlyArray<NonEmptyString>;
}>;

type IHttpHandler = (
  context: Context,
  userAttrs: IAzureUserAttributes,
  param: NonEmptyString
) => Promise<IResponseSuccessJson<ResultSet> | IResponseErrorInternal>;

export const GetFailedUserDataProcessingListHandler = (
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): IHttpHandler => async (
  ctx,
  userAttrs,
  choice
): Promise<IResponseSuccessJson<ResultSet> | IResponseErrorInternal> => {
  const tableQuery = new TableQuery()
    .select("RowKey")
    .where("PartitionKey == ?", choice);

  const query = (): Promise<
    Either<Error, TableService.QueryEntitiesResult<TableEntry>>
  > =>
    new Promise<Either<Error, TableService.QueryEntitiesResult<TableEntry>>>(
      resolve =>
        tableService.queryEntities(
          failedUserDataProcessingTable,
          tableQuery,
          null,
          (
            error: Error,
            result: TableService.QueryEntitiesResult<TableEntry>,
            response: ServiceResponse
          ) => resolve(response.isSuccessful ? right(result) : left(error))
        )
    );

  const resultEntriesOrError = await query();

  return resultEntriesOrError.bimap(
    er => ResponseErrorInternal(er.message),
    rs => {
      const resultSet = {
        failedDataProcessingUsers: rs.entries.map(
          e => e.RowKey._
        ) as ReadonlyArray<NonEmptyString>
      };
      return ResponseSuccessJson(resultSet);
    }
  ).value;
};

export const GetFailedUserDataProcessingList = (
  serviceModel: ServiceModel,
  tableService: TableService,
  failedUserDataProcessingTable: NonEmptyString
): express.RequestHandler => {
  const handler = GetFailedUserDataProcessingListHandler(
    tableService,
    failedUserDataProcessingTable
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureUserAttributesMiddleware(serviceModel),
    RequiredParamMiddleware("choice", t.string)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
};
