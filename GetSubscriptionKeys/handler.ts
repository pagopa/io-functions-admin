import { Context } from "@azure/functions";

import * as express from "express";

import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
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

const azureSubscriptionId = getRequiredStringEnv("AZURE_SUBSCRIPTION_ID");
const servicePrincipalClientId = getRequiredStringEnv(
  "SERVICE_PRINCIPAL_CLIENT_ID"
);
const servicePrincipalSecret = getRequiredStringEnv("SERVICE_PRINCIPAL_SECRET");
const servicePrincipalTenantId = getRequiredStringEnv(
  "SERVICE_PRINCIPAL_TENANT_ID"
);
const azureApimResourceGroup = getRequiredStringEnv(
  "AZURE_APIM_RESOURCE_GROUP"
);
const azureApim = getRequiredStringEnv("AZURE_APIM");

function getApiClient(): TaskEither<Error, ApiManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        servicePrincipalClientId,
        servicePrincipalSecret,
        servicePrincipalTenantId
      ),
    toError
  ).map(
    credentials => new ApiManagementClient(credentials, azureSubscriptionId)
  );
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

export function GetSubscriptionKeysHandler(): IGetSubscriptionKeysHandler {
  return async (context, __, serviceId) => {
    const response = await getApiClient()
      .chain(apiClient =>
        tryCatch(
          () =>
            apiClient.subscription.get(
              azureApimResourceGroup,
              azureApim,
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
export function GetSubscriptionKeys(): express.RequestHandler {
  const handler = GetSubscriptionKeysHandler();

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the proper group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ServiceIdMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
