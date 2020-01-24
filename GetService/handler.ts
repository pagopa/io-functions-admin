import { Context } from "@azure/functions";

import * as express from "express";

import { isRight } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import {
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import { CustomTelemetryClientFactory } from "io-functions-commons/dist/src/utils/application_insights";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { ServiceModel } from "../models/service";
import { retrievedServiceToApiService } from "../utils/conversions";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IGetServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<ApiService>
  | IResponseErrorQuery
  | IResponseErrorNotFound
>;

export function GetServiceHandler(
  _GCTC: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): IGetServiceHandler {
  return async (_, __, ___, _____, serviceId) => {
    const errorOrMaybeRetrievedService = await serviceModel.findOneByServiceId(
      serviceId
    );

    if (isRight(errorOrMaybeRetrievedService)) {
      const maybeRetrievedService = errorOrMaybeRetrievedService.value;
      if (isNone(maybeRetrievedService)) {
        return ResponseErrorNotFound(
          "Service not found",
          "The service you requested was not found in the system."
        );
      } else {
        return ResponseSuccessJson(
          retrievedServiceToApiService(maybeRetrievedService.value)
        );
      }
    } else {
      return ResponseErrorQuery(
        "Error while retrieving the service",
        errorOrMaybeRetrievedService.value
      );
    }
  };
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */
export function GetService(
  getCustomTelemetryClient: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = GetServiceHandler(getCustomTelemetryClient, serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
