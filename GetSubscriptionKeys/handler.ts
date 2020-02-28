import { Context } from "@azure/functions";

import * as express from "express";

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
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { toError } from "fp-ts/lib/Either";
import { tryCatch } from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { ServiceId } from "../generated/definitions/ServiceId";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<{
      primary_key: string;
      secondary_key: string;
    }>
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

export function GetSubscriptionKeysHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, __, ___, serviceId) => {
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .chain(apiClient =>
        tryCatch(
          () =>
            apiClient.subscription.get(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              serviceId
            ),
          toError
        )
      )
      .map(subscription =>
        ResponseSuccessJson({
          primary_key: subscription.primaryKey,
          secondary_key: subscription.secondaryKey
        })
      )
      .mapLeft(error => {
        context.log.error(error);
        // tslint:disable-next-line:no-any
        const anyError = error as any;
        if ("statusCode" in anyError && anyError.statusCode === 404) {
          return ResponseErrorNotFound(
            "Not found",
            "The required resource does not exist"
          );
        }
        return ResponseErrorInternal("Internal server error");
      })
      .run();
    return response.value;
  };
}

/**
 * Wraps a GetSubscriptionsKeys handler inside an Express request handler.
 */
export function GetSubscriptionKeys(
  serviceModel: ServiceModel,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = GetSubscriptionKeysHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceKeyRead group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
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
