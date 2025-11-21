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

import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { ServiceId } from "../generated/definitions/ServiceId";
import { SubscriptionKeys } from "../generated/definitions/SubscriptionKeys";
import { SubscriptionKeyTypeEnum } from "../generated/definitions/SubscriptionKeyType";
import { SubscriptionKeyTypePayload } from "../generated/definitions/SubscriptionKeyTypePayload";
import { getApiClient, IAzureApimConfig } from "../utils/apim";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";
import { SubscriptionKeyTypeMiddleware } from "../utils/middlewares/subscriptionKeyType";

/**
 * To be used for exhaustive checks
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function assertNever(_: never): never {
  throw new Error("should not have executed this");
}

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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function RegenerateSubscriptionKeysHandler(
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, serviceId, keyTypePayload) =>
    await pipe(
      getApiClient(azureApimConfig.subscriptionId),
      TE.chain(apiClient =>
        pipe(
          TE.tryCatch(() => {
            switch (keyTypePayload.key_type) {
              case SubscriptionKeyTypeEnum.PRIMARY_KEY:
                return apiClient.subscription.regeneratePrimaryKey(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  serviceId
                );
              case SubscriptionKeyTypeEnum.SECONDARY_KEY:
                return apiClient.subscription.regenerateSecondaryKey(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  serviceId
                );
              default:
                assertNever(keyTypePayload.key_type);
            }
          }, E.toError),
          TE.chain(() =>
            TE.tryCatch(
              () =>
                apiClient.subscription.listSecrets(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  serviceId
                ),
              E.toError
            )
          )
        )
      ),
      TE.map(subscription =>
        ResponseSuccessJson({
          primary_key: subscription.primaryKey as NonEmptyString,
          secondary_key: subscription.secondaryKey as NonEmptyString
        })
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
export function RegenerateSubscriptionKeys(
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = RegenerateSubscriptionKeysHandler(azureApimConfig);

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
