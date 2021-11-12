import { Context } from "@azure/functions";

import * as express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as T from "fp-ts/lib/Task";
import * as E from "fp-ts/lib/Either";
import * as RA from "fp-ts/lib/ReadonlyArray";
import { sequenceS } from "fp-ts/lib/Apply";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { withRequestMiddlewares } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { UserContract } from "@azure/arm-apimanagement/esm/models";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { UpdateSubscriptionOwnerPayload } from "../generated/definitions/UpdateSubscriptionOwnerPayload";
import { buildApimClient, IProxyApimClient } from "./proxyApimClient";

interface IResults {
  readonly errors: ReadonlyArray<string>;
  readonly results: ReadonlyArray<string>;
}

/**
 * Move a subscription from a owner to another
 */
const moveSubscription = (
  proxyClient: IProxyApimClient,
  serviceId: string,
  origin: UserContract,
  destination: UserContract
): TE.TaskEither<Error, string> =>
  pipe(
    proxyClient.getSubscription(serviceId),
    TE.mapLeft(
      e => new Error(`ERROR|${e.message} SubscriptionId = ${serviceId}`)
    ),
    TE.chain(
      TE.fromPredicate(
        _subscription => origin.id === _subscription.ownerId,
        _subscription =>
          new Error(
            `ERROR|Subscription ${_subscription.name} is not owned by ${origin.email}`
          )
      )
    ),
    TE.chain(subscription =>
      proxyClient.updateSubscriptionOwner(subscription, destination.id)
    ),
    TE.map(
      _ =>
        `Update subscription ${_.name} with owner ${destination.id} [${destination.email}]`
    )
  );

/**
 * Move a list of subscriptions from an owner to another
 */
const moveSubscriptions = (
  proxyClient: IProxyApimClient,
  servicesToMigrate: ReadonlyArray<string>,
  orig_email: NonEmptyString,
  dest_email: NonEmptyString
): TE.TaskEither<Error, IResults> =>
  pipe(
    {
      origin: proxyClient.getUserByEmail(orig_email),
      target: proxyClient.getUserByEmail(dest_email)
    },
    sequenceS(TE.ApplicativePar),
    TE.chainW(({ origin, target }) =>
      pipe(
        servicesToMigrate.map(serviceId =>
          moveSubscription(proxyClient, serviceId, origin, target)
        ),
        RA.sequence(T.ApplicativePar),
        T.map(arr => ({
          errors: RA.lefts(arr).map(e => e.message),
          results: RA.rights(arr)
        })),
        TE.fromTask
      )
    ),
    TE.mapLeft(E.toError)
  );

type IUpdateSubscriptionOwnerHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  payload: UpdateSubscriptionOwnerPayload
) => Promise<IResponseSuccessJson<IResults> | IResponseErrorInternal>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionOwnerHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IUpdateSubscriptionOwnerHandler {
  return async (
    _context,
    _,
    { current_email, destination_email, subscription_ids }
  ): ReturnType<IUpdateSubscriptionOwnerHandler> =>
    pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.map(client =>
        buildApimClient(
          client,
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim
        )
      ),
      TE.chain(proxyClient =>
        moveSubscriptions(
          proxyClient,
          subscription_ids,
          current_email,
          destination_email
        )
      ),
      TE.mapLeft(_err => ResponseErrorInternal(_err.message)),
      TE.map(res => ResponseSuccessJson(res)),
      TE.toUnion
    )();
}

/**
 * Wraps an UpdateUser handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionOwner(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = UpdateSubscriptionOwnerHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(UpdateSubscriptionOwnerPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
