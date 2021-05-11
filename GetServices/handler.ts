import { Context } from "@azure/functions";

import * as express from "express";

import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";

import { isLeft } from "fp-ts/lib/Either";
import { collect, StrMap } from "fp-ts/lib/StrMap";
import { tryCatch } from "fp-ts/lib/TaskEither";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { ServiceIdWithVersion } from "../generated/definitions/ServiceIdWithVersion";

type IGetServicesHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<{
      readonly items: ReadonlyArray<ServiceIdWithVersion>;
      readonly page_size: number;
    }>;

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IGetServicesHandlerResult>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_, __) => {
    const allRetrievedServicesIterator = serviceModel
      .getCollectionIterator()
      [Symbol.asyncIterator]();

    return tryCatch(
      () =>
        asyncIteratorToArray(
          flattenAsyncIterator(allRetrievedServicesIterator)
        ),
      toCosmosErrorResponse
    )
      .fold<IGetServicesHandlerResult>(
        error => ResponseErrorQuery("Cannot get services", error),
        results => {
          const reducedResults = results.reduce((prev, maybeCurr) => {
            if (isLeft(maybeCurr)) {
              return prev;
            }
            const curr = maybeCurr.value;
            // keep only the latest version
            const isNewer =
              !prev[curr.serviceId] || curr.version > prev[curr.serviceId];
            return {
              ...prev,
              ...(isNewer ? { [curr.serviceId]: curr.version } : {})
            };
          }, {});
          const items = collect(
            new StrMap(reducedResults),
            (serviceId, v: NonNegativeInteger) => ({
              id: serviceId,
              version: v
            })
          );
          // FIXME: make response iterable over results pages
          return ResponseSuccessJson({
            items,
            page_size: items.length
          });
        }
      )
      .run();
  };
}

/**
 * Wraps a GetServices handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServices(
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = GetServicesHandler(serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceList group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceList]))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
