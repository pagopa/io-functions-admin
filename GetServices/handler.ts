import { Context } from "@azure/functions";

import * as express from "express";

import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import {
  IFoldableResultIterator,
  iteratorToValue,
  reduceResultIterator
} from "io-functions-commons/dist/src/utils/documentdb";
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

import { collect, StrMap } from "fp-ts/lib/StrMap";
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
    const allRetrievedServicesIterator = serviceModel.getCollectionIterator();
    const allServicesIterator: IFoldableResultIterator<
      Record<string, ApiService>
    > = reduceResultIterator(allRetrievedServicesIterator, (prev, curr) => {
      // keep only the latest version
      const isNewer =
        !prev[curr.serviceId] || curr.version > prev[curr.serviceId].version;
      return {
        ...prev,
        ...(isNewer
          ? { [curr.serviceId]: retrievedServiceToApiService(curr) }
          : {})
      };
    });
    return (await iteratorToValue(allServicesIterator, {})).fold<
      IGetServicesHandlerResult
    >(
      error => ResponseErrorQuery("Cannot get services", error),
      services => {
        const items = collect(new StrMap(services), (_____, v) => v);
        return ResponseSuccessJson({
          items,
          page_size: items.length
        });
      }
    );
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
