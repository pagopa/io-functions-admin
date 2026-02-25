import { InvocationContext } from "@azure/functions";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
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

import { ServiceId } from "../generated/definitions/ServiceId";
import { getApiClient, IAzureApimConfig } from "../utils/apim";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IGetSubscriptionKeysHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseSuccessJson<{
      readonly primary_key: string;
      readonly secondary_key: string;
    }>
>;

export function GetSubscriptionKeys(azureApimConfig: IAzureApimConfig) {
  const handler = GetSubscriptionKeysHandler(azureApimConfig);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceKeyRead group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a GetSubscriptionsKeys handler inside an Express request handler.
 */

export function GetSubscriptionKeysHandler(
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, serviceId) =>
    pipe(
      getApiClient(azureApimConfig.subscriptionId),
      TE.chain(apiClient =>
        TE.tryCatch(
          () =>
            apiClient.subscription.listSecrets(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              serviceId
            ),
          E.toError
        )
      ),
      TE.map(subscription =>
        ResponseSuccessJson({
          primary_key: subscription.primaryKey as NonEmptyString,
          secondary_key: subscription.secondaryKey as NonEmptyString
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
