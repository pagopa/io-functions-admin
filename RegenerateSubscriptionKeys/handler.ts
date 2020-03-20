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
import { SubscriptionKeys } from "../generated/definitions/SubscriptionKeys";
import { SubscriptionKeyTypeEnum } from "../generated/definitions/SubscriptionKeyType";
import { SubscriptionKeyTypePayload } from "../generated/definitions/SubscriptionKeyTypePayload";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";
import { SubscriptionKeyTypeMiddleware } from "../utils/middlewares/subscriptionKeyType";

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId,
  keyTypePayload: SubscriptionKeyTypePayload
) => Promise<
  | IResponseSuccessJson<SubscriptionKeys>
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

export function RegenerateSubscriptionKeysHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, serviceId, keyTypePayload) => {
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .chain(apiClient =>
        tryCatch(() => {
          if (keyTypePayload.key_type === SubscriptionKeyTypeEnum.PRIMARY_KEY) {
            return apiClient.subscription.regeneratePrimaryKey(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              serviceId
            );
          }
          if (
            keyTypePayload.key_type === SubscriptionKeyTypeEnum.SECONDARY_KEY
          ) {
            return apiClient.subscription.regenerateSecondaryKey(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              serviceId
            );
          }
          throw new Error("Unhandled key type");
        }, toError).chain(() =>
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
export function RegenerateSubscriptionKeys(
  serviceModel: ServiceModel,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = RegenerateSubscriptionKeysHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceKeyWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    SubscriptionKeyTypeMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
