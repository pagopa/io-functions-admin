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
import { withRequestMiddlewares } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import { ApiManagementClient } from "@azure/arm-apimanagement";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { toError } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
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
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";
import { SubscriptionKeyTypeMiddleware } from "../utils/middlewares/subscriptionKeyType";

export interface IServicePrincipalCreds {
  readonly clientId: string;
  readonly secret: string;
  readonly tenantId: string;
}

export interface IAzureApimConfig {
  readonly subscriptionId: string;
  readonly apimResourceGroup: string;
  readonly apim: string;
}

function getApiClient(
  servicePrincipalCreds: IServicePrincipalCreds,
  subscriptionId: string
): TaskEither<Error, ApiManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        servicePrincipalCreds.clientId,
        servicePrincipalCreds.secret,
        servicePrincipalCreds.tenantId
      ),
    toError
  ).map(credentials => new ApiManagementClient(credentials, subscriptionId));
}

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
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
  return async (context, __, ___, ____, serviceId, keyTypePayload) => {
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
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceKeyWrite])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    SubscriptionKeyTypeMiddleware
  );

  return middlewaresWrap(
    checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) => ipTuple(c, u))
  );
}
