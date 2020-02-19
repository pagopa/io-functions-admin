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
import { ApplicationTokenCredentials } from "@azure/ms-rest-nodeauth";
import { TokenResponse } from "@azure/ms-rest-nodeauth/dist/lib/credentials/tokenClientCredentials";
import { right, toError } from "fp-ts/lib/Either";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
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

export interface ITokenAndCredentials {
  readonly token: TokenResponse;
  readonly loginCreds: ApplicationTokenCredentials;
  readonly expiresOn: number;
}

export interface IServicePrincipalCreds {
  readonly servicePrincipalClientId: string;
  readonly servicePrincipalSecret: string;
  readonly servicePrincipalTenantId: string;
}

function loginToApim(
  servicePrincipalCreds: IServicePrincipalCreds,
  tokenAndCredentials?: ITokenAndCredentials
): TaskEither<Error, ITokenAndCredentials> {
  const isTokenExpired = tokenAndCredentials
    ? tokenAndCredentials.expiresOn <= Date.now()
    : false;

  // return old credentials in case the token is not expired
  if (tokenAndCredentials && !isTokenExpired) {
    return fromEither(right(tokenAndCredentials));
  }

  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        servicePrincipalCreds.servicePrincipalClientId,
        servicePrincipalCreds.servicePrincipalSecret,
        servicePrincipalCreds.servicePrincipalTenantId
      ),
    toError
  ).chain(loginCreds =>
    tryCatch(() => loginCreds.getToken(), toError).map(token => ({
      // cache token for 1 hour
      // we cannot use tokenCreds.token.expiresOn
      // because of a bug in ms-rest-library
      // see https://github.com/Azure/azure-sdk-for-node/pull/3679
      expiresOn: Date.now() + 3600 * 1000,
      loginCreds,
      token
    }))
  );
}

function getApiClient(
  tokenCreds: ITokenAndCredentials
): TaskEither<Error, ApiManagementClient> {
  return loginToApim(
    {
      servicePrincipalClientId,
      servicePrincipalSecret,
      servicePrincipalTenantId
    },
    tokenCreds
  ).map(tokenAndCredentials => {
    // tslint:disable-next-line:no-parameter-reassignment
    tokenCreds = tokenAndCredentials;
    return new ApiManagementClient(tokenCreds.loginCreds, azureSubscriptionId);
  });
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
  tokenCreds: ITokenAndCredentials
): IGetSubscriptionKeysHandler {
  return async (context, __, serviceId) => {
    const response = await getApiClient(tokenCreds)
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
export function GetSubscriptionKeys(
  tokenCreds: ITokenAndCredentials
): express.RequestHandler {
  const handler = GetSubscriptionKeysHandler(tokenCreds);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the proper group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ServiceIdMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
