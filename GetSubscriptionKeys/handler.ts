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
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

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
  return async (context, __, serviceId) => {
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
    // Allow only users in the proper group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ServiceIdMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
