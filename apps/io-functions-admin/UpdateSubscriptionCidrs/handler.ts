import { InvocationContext } from "@azure/functions";
import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
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

import { CIDRsPayload } from "../generated/definitions/CIDRsPayload";
import { SubscriptionCIDRs } from "../generated/definitions/SubscriptionCIDRs";
import { getApiClient, IAzureApimConfig } from "../utils/apim";

type IUpdateSubscriptionCidrsHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString,
  cidrsPayload: CIDRsPayload
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseSuccessJson<SubscriptionCIDRs>
>;

const subscriptionExists = (
  azureApimConfig: IAzureApimConfig,
  subscriptionId: NonEmptyString
): TE.TaskEither<IResponseErrorInternal | IResponseErrorNotFound, true> =>
  pipe(
    getApiClient(azureApimConfig.subscriptionId),
    TE.mapLeft(_ =>
      ResponseErrorInternal("Error trying to get Api Management Client")
    ),
    TE.chainW(apiClient =>
      pipe(
        TE.tryCatch(
          () =>
            apiClient.subscription.get(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              subscriptionId
            ),
          E.toError
        ),
        TE.mapLeft(_ =>
          ResponseErrorNotFound(
            "Subscription not found",
            "Error trying to get APIM Subscription"
          )
        ),
        TE.map(_ => true)
      )
    )
  );

export function UpdateSubscriptionCidrs(
  azureApimConfig: IAzureApimConfig,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
) {
  const handler = UpdateSubscriptionCidrsHandler(
    azureApimConfig,
    subscriptionCIDRsModel
  );

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the subscription id value from the request
    RequiredParamMiddleware("subscriptionId", NonEmptyString),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(CIDRsPayload)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps an UpdateSubscriptionCidrs handler inside an Express request handler.
 *
 * **IMPORTANT:** This handler should be used only for *MANAGE Flow*
 */

export function UpdateSubscriptionCidrsHandler(
  azureApimConfig: IAzureApimConfig,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): IUpdateSubscriptionCidrsHandler {
  return async (_context, _, subscriptionId, cidrs) => {
    const maybeSubscriptionExists = await subscriptionExists(
      azureApimConfig,
      subscriptionId
    )();
    if (E.isLeft(maybeSubscriptionExists)) {
      return maybeSubscriptionExists.left;
    }

    const errorOrMaybeUpdatedSubscriptionCIDRs =
      await subscriptionCIDRsModel.upsert({
        cidrs: toAuthorizedCIDRs(Array.from(cidrs)),
        kind: "INewSubscriptionCIDRs",
        subscriptionId
      })();
    if (E.isLeft(errorOrMaybeUpdatedSubscriptionCIDRs)) {
      return ResponseErrorQuery(
        "Error trying to update subscription cidrs",
        errorOrMaybeUpdatedSubscriptionCIDRs.left
      );
    }

    const updatedSubscriptionCIDRs = errorOrMaybeUpdatedSubscriptionCIDRs.right;

    return ResponseSuccessJson({
      cidrs: Array.from(updatedSubscriptionCIDRs.cidrs),
      id: updatedSubscriptionCIDRs.subscriptionId
    });
  };
}
