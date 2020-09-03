import { Context } from "@azure/functions";

import * as express from "express";

import { ServiceModel } from "io-functions-commons/dist/src/models/service";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";

import { flatten } from "fp-ts/lib/Array";
import { isLeft } from "fp-ts/lib/Either";
import { collect, StrMap } from "fp-ts/lib/StrMap";
import { tryCatch } from "fp-ts/lib/TaskEither";
import {
  asyncIteratorToArray,
  mapAsyncIterator
} from "io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { Service as ApiService } from "../generated/definitions/Service";
import { retrievedServiceToApiService } from "../utils/conversions";

type IGetServicesHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<{ items: readonly ApiService[]; page_size: number }>;

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IGetServicesHandlerResult>;

export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  return async (_, __) => {
    const allRetrievedServicesIterator = serviceModel
      .getCollectionIterator()
      [Symbol.asyncIterator]();
    const allServicesIterator = mapAsyncIterator(
      allRetrievedServicesIterator,
      arr =>
        // tslint:disable-next-line: no-inferred-empty-object-type
        arr.reduce((prev, maybeCurr) => {
          if (isLeft(maybeCurr)) {
            return prev;
          }
          const curr = maybeCurr.value;
          // keep only the latest version
          const isNewer =
            !prev[curr.serviceId] ||
            curr.version > prev[curr.serviceId].version;
          return {
            ...prev,
            ...(isNewer
              ? { [curr.serviceId]: retrievedServiceToApiService(curr) }
              : {})
          };
        }, {})
    );

    return tryCatch(
      () => asyncIteratorToArray(allServicesIterator),
      toCosmosErrorResponse
    )
      .fold<IGetServicesHandlerResult>(
        error => ResponseErrorQuery("Cannot get services", error),
        results => {
          // tslint:disable-next-line: no-inferred-empty-object-type
          const reducedResults = results.reduce((prev, curr) => {
            return {
              ...prev,
              ...curr
            };
          }, {});
          const items = collect(
            new StrMap(reducedResults),
            (_____, v: ApiService) => v
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
