import { Context } from "@azure/functions";
import * as express from "express";
import * as TE from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { withRequestMiddlewares } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";

import { Subscription } from "../generated/definitions/Subscription";
import {
  getApiClient,
  getSubscription,
  mapApimRestError,
  IAzureApimConfig,
  IServicePrincipalCreds,
  parseOwnerIdFullPath
} from "../utils/apim";
import { genericInternalErrorHandler } from "../utils/errorHandler";

type IGetSubscriptionHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString
) => Promise<
  | IResponseSuccessJson<Subscription>
  | IResponseErrorInternal
  | IResponseErrorNotFound
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscriptionHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, subscriptionId) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "GetSubscription | " + errorMessage,
        error,
        errorMessage
      );
    return pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.mapLeft(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      ),
      TE.chain(apim =>
        pipe(
          getSubscription(
            apim,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            subscriptionId
          ),
          TE.mapLeft(mapApimRestError("Subscription")),
          TE.map(subscription =>
            ResponseSuccessJson({
              id: subscription.id,
              owner_id: parseOwnerIdFullPath(
                subscription.ownerId as NonEmptyString
              ),
              primary_key: subscription.primaryKey,
              scope: subscription.scope,
              secondary_key: subscription.secondaryKey
            })
          )
        )
      ),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a GetSubscription handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscription(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = GetSubscriptionHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the subscription id value from the request
    RequiredParamMiddleware("subscriptionid", NonEmptyString)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
