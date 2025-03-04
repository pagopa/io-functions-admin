import { Context } from "@azure/functions";
import * as express from "express";
import * as E from "fp-ts/lib/Either";
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
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";

import { SubscriptionWithoutKeys } from "../generated/definitions/SubscriptionWithoutKeys";
import {
  getApiClient,
  IAzureApimConfig,
  parseOwnerIdFullPath
} from "../utils/apim";

type IGetSubscriptionHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString
) => Promise<
  | IResponseSuccessJson<SubscriptionWithoutKeys>
  | IResponseErrorInternal
  | IResponseErrorNotFound
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscriptionHandler(
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, subscriptionId) =>
    pipe(
      getApiClient(azureApimConfig.subscriptionId),
      TE.chain(apiClient =>
        TE.tryCatch(
          () =>
            apiClient.subscription.get(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              subscriptionId
            ),
          E.toError
        )
      ),
      TE.map(subscription =>
        ResponseSuccessJson({
          id: subscription.id,
          owner_id: parseOwnerIdFullPath(
            subscription.ownerId as NonEmptyString
          ),
          scope: subscription.scope as NonEmptyString
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
 * Wraps a GetSubscription handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetSubscription(
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = GetSubscriptionHandler(azureApimConfig);

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
