import { InvocationContext } from "@azure/functions";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { SubscriptionWithoutKeys } from "../generated/definitions/SubscriptionWithoutKeys";
import {
  getApiClient,
  IAzureApimConfig,
  parseOwnerIdFullPath
} from "../utils/apim";

type IGetSubscriptionHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseSuccessJson<SubscriptionWithoutKeys>
>;

export function GetSubscription(azureApimConfig: IAzureApimConfig) {
  const handler = GetSubscriptionHandler(azureApimConfig);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the subscription id value from the request
    RequiredParamMiddleware("subscriptionid", NonEmptyString)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a GetSubscription handler inside an Express request handler.
 */

export function GetSubscriptionHandler(
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionHandler {
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
        context.error(error);
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
