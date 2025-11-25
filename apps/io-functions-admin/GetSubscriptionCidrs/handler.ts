import { Context } from "@azure/functions";
import { SubscriptionCIDRsModel } from "@pagopa/io-functions-commons/dist/src/models/subscription_cidrs";
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
import express from "express";
import { pipe } from "fp-ts/lib/function";
import { isSome } from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import { SubscriptionCIDRs } from "../generated/definitions/SubscriptionCIDRs";

type IGetSubscriptionCidrsHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  subscriptionid: NonEmptyString
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseSuccessJson<SubscriptionCIDRs>
>;

export function GetSubscriptionCidrs(
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): express.RequestHandler {
  const handler = GetSubscriptionCidrsHandler(subscriptionCIDRsModel);

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

/**
 * Wraps a GetSubscriptionCidrs handler inside an Express request handler.
 */

export function GetSubscriptionCidrsHandler(
  subscriptionCIDRsModel: SubscriptionCIDRsModel
): IGetSubscriptionCidrsHandler {
  return async (context, _, subscriptionId) =>
    pipe(
      subscriptionCIDRsModel.findLastVersionByModelId([subscriptionId]),
      TE.map(subscriptionCIDRs =>
        isSome(subscriptionCIDRs)
          ? ResponseSuccessJson({
              cidrs: Array.from(subscriptionCIDRs.value.cidrs),
              id: subscriptionId
            })
          : ResponseErrorNotFound(
              "Not found",
              "The required document does not exist"
            )
      ),
      TE.mapLeft(error => {
        context.log.error(error);
        return ResponseErrorInternal(`Internal server error - db error`);
      }),
      TE.toUnion
    )();
}
