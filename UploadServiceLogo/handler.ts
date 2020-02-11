import { Context } from "@azure/functions";

import * as express from "express";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorNotFound,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";

import { ServiceModel } from "io-functions-commons/dist/src/models/service";
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

import { Logo as ApiLogo } from "../generated/definitions/Logo";
import { ServiceId } from "../generated/definitions/ServiceId";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IUpdateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  serviceId: ServiceId,
  logoPayload: ApiLogo
) => Promise<
  // tslint:disable-next-line: max-union-size
  | IResponseSuccessRedirectToResource<{}, {}>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

export function UpdateServiceLogoHandler(
  serviceModel: ServiceModel,
  logosUrl: string
): IUpdateServiceHandler {
  return async (context, __, ___, ____, serviceId, logoPayload) => {
    const errorOrMaybeRetrievedService = await serviceModel.findOneByServiceId(
      serviceId
    );
    if (isLeft(errorOrMaybeRetrievedService)) {
      return ResponseErrorQuery(
        "Error trying to retrieve existing service",
        errorOrMaybeRetrievedService.value
      );
    }

    const maybeService = errorOrMaybeRetrievedService.value;
    if (isNone(maybeService)) {
      return ResponseErrorNotFound(
        "Error",
        "Could not find a service with the provided serviceId"
      );
    }

    // tslint:disable-next-line:no-object-mutation
    context.bindings.logo = Buffer.from(logoPayload.logo, "base64");

    return ResponseSuccessRedirectToResource(
      {},
      `${logosUrl}/services/${serviceId}.png`,
      {}
    );
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */
export function UploadServiceLogo(
  serviceModel: ServiceModel,
  logosUrl: string
): express.RequestHandler {
  const handler = UpdateServiceLogoHandler(serviceModel, logosUrl);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    // Extracts the Logo payload from the request body
    LogoPayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
