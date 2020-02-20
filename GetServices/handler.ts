import { Context } from "@azure/functions";

import * as express from "express";

import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { mapResultIterator } from "io-functions-commons/dist/src/utils/documentdb";
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
  IResponseSuccessJsonIterator,
  ResponseJsonIterator
} from "io-functions-commons/dist/src/utils/response";

import { Service as ApiService } from "../generated/definitions/Service";
import { retrievedServiceToApiService } from "../utils/conversions";

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IResponseSuccessJsonIterator<ApiService>>;

export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  return async (_, __) => {
    const allRetrievedServicesIterator = await serviceModel.getCollectionIterator();
    const allServicesIterator = mapResultIterator(
      allRetrievedServicesIterator,
      retrievedServiceToApiService
    );
    return ResponseJsonIterator(allServicesIterator);
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
