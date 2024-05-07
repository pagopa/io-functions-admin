import { Context } from "@azure/functions";

import * as express from "express";

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

import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
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

type SubscriptionKeysResponse = t.TypeOf<typeof SubscriptionKeysResponse>;
const SubscriptionKeysResponse = t.type({
  primary_key: t.string,
  secondary_key: t.string
});

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<SubscriptionKeysResponse>
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscriptionKeysHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  const apimClient = getApiClient(
    servicePrincipalCreds,
    azureApimConfig.subscriptionId
  );
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, serviceId) =>
    pipe(
      TE.tryCatch(
        () =>
          apimClient.subscription.get(
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            serviceId
          ),
        E.toError
      ),
      TE.chainW(subscription =>
        pipe(
          {
            primary_key: subscription.primaryKey,
            secondary_key: subscription.secondaryKey
          },
          SubscriptionKeysResponse.decode,
          E.mapLeft(E.toError),
          E.map(ResponseSuccessJson),
          TE.fromEither
        )
      ),
      TE.mapLeft(error => {
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
      }),
      TE.toUnion
    )();
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
