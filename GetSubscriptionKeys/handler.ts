import { Context } from "@azure/functions";

import * as express from "express";

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

import { toError } from "fp-ts/lib/Either";
import { tryCatch } from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
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
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<{
      readonly primary_key: string;
      readonly secondary_key: string;
    }>
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscriptionKeysHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, serviceId) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscriptionKeys(
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
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
