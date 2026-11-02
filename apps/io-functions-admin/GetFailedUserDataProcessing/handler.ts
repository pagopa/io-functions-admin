import { TableClient } from "@azure/data-tables";
import { InvocationContext } from "@azure/functions";
import { UserDataProcessingChoice } from "@pagopa/io-functions-commons/dist/generated/definitions/v2/UserDataProcessingChoice";
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
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import { TableEntityWithRowKey } from "../types/table";
import { getTableStorageStatusCode } from "../utils/storage";

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

export const GetFailedUserDataProcessingHandler =
  (tableClient: TableClient): IHttpHandler =>
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
      TE.tryCatch(async () => {
        try {
          return O.some(
            await tableClient.getEntity<TableEntityWithRowKey<FiscalCode>>(
              choice,
              fiscalCode
            )
          );
        } catch (error) {
          if (getTableStorageStatusCode(error) === 404) {
            return O.none;
          }
          throw error;
        }
      }, E.toError),
      TE.mapLeft(er => ResponseErrorInternal(er.message)),
      TE.chainW(
        flow(
          TE.fromOption(() =>
            ResponseErrorNotFound("Not found!", "No record found.")
          ),
          TE.map(rs => ({
            failedDataProcessingUser: rs.rowKey
          }))
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();

export const GetFailedUserDataProcessing = (tableClient: TableClient) => {
  const handler = GetFailedUserDataProcessingHandler(tableClient);

  const middlewares = [
    ContextMiddleware(),
    RequiredParamMiddleware("choice", UserDataProcessingChoice),
    RequiredParamMiddleware("fiscalCode", FiscalCode)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
};
