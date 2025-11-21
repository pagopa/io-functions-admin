import { Context } from "@azure/functions";

import * as express from "express";

import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";

import {
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
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

import { retrievedServiceToApiService } from "../utils/conversions";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IGetServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<ApiService>
  | IResponseErrorQuery
  | IResponseErrorNotFound
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServiceHandler(
  serviceModel: ServiceModel
): IGetServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_, __, serviceId) =>
    pipe(
      serviceModel.findOneByServiceId(serviceId),
      TE.mapLeft(e =>
        ResponseErrorQuery("Error while retrieving the service", e)
      ),
      TE.chainW(
        TE.fromOption(() =>
          ResponseErrorNotFound(
            "Service not found",
            "The service you requested was not found in the system."
          )
        )
      ),
      TE.map(retrievedServiceToApiService),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetService(serviceModel: ServiceModel): express.RequestHandler {
  const handler = GetServiceHandler(serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
