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

import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
import { pipe } from "fp-ts/lib/function";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { CIDRsPayload } from "../generated/definitions/CIDRsPayload";

type IUpdateSubscriptionCidrsHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString,
  cidrsPayload: CIDRsPayload
) => Promise<
  | IResponseSuccessJson<CIDRsPayload>
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery
>;

const subscriptionExists = (
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  subscriptionId: NonEmptyString
): TE.TaskEither<IResponseErrorInternal | IResponseErrorNotFound, true> =>
  pipe(
    getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionCidrsHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): IUpdateSubscriptionCidrsHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, subscriptionId, cidrs) => {
    const maybeSubscriptionExists = await subscriptionExists(
      servicePrincipalCreds,
      azureApimConfig,
      subscriptionId
    )();
    if (E.isLeft(maybeSubscriptionExists)) {
      return maybeSubscriptionExists.left;
    }

    const errorOrMaybeUpdatedSubscriptionCIDRs = await subscriptionCIDRsModel.upsert(
      {
        cidrs: toAuthorizedCIDRs(Array.from(cidrs)),
        kind: "INewSubscriptionCIDRs",
        subscriptionId
      }
    )();
    if (E.isLeft(errorOrMaybeUpdatedSubscriptionCIDRs)) {
      return ResponseErrorQuery(
        "Error trying to update subscription cidrs",
        errorOrMaybeUpdatedSubscriptionCIDRs.left
      );
    }

    const updatedSubscriptionCIDRs = errorOrMaybeUpdatedSubscriptionCIDRs.right;

    return ResponseSuccessJson(Array.from(updatedSubscriptionCIDRs.cidrs));
  };
}

/**
 * Wraps an UpdateSubscriptionCidrs handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionCidrs(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): express.RequestHandler {
  const handler = UpdateSubscriptionCidrsHandler(
    servicePrincipalCreds,
    azureApimConfig,
    subscriptionCIDRsModel
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the subscription id value from the request
    RequiredParamMiddleware("subscriptionid", NonEmptyString),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(CIDRsPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
