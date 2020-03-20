import { Context } from "@azure/functions";
import * as express from "express";
import { fromEither, fromPredicate, tryCatch } from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import { Errors } from "io-ts";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { ProductNamePayload } from "../generated/definitions/ProductNamePayload";
import { Subscription } from "../generated/definitions/Subscription";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { subscriptionContractToApiSubscription } from "../utils/conversions";
import {
  genericInternalErrorHandler,
  genericInternalValidationErrorHandler
} from "../utils/errorHandler";
import { CreateSubscriptionParamsMiddleware } from "../utils/middlewares/createSubscriptionParamsMiddleware";

type ICreateSubscriptionHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  requestParams: readonly [EmailAddress, NonEmptyString],
  productNamePayload: ProductNamePayload
) => Promise<
  | IResponseSuccessJson<Subscription>
  | IResponseErrorInternal
  | IResponseErrorNotFound
>;

export function CreateSubscriptionHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): ICreateSubscriptionHandler {
  return async (context, _, requestParams, productNamePayload) => {
    const [userEmail, subscriptionId] = requestParams;
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "CreateSubscription | " + errorMessage,
        error,
        errorMessage
      );
    const internalValidationErrorHandler = (
      errorMessage: string,
      errors: Errors
    ) =>
      genericInternalValidationErrorHandler(
        context,
        "CreateSubscription | " + errorMessage,
        errors,
        errorMessage
      );
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      )
      .chain(apimClient =>
        tryCatch(
          () =>
            apimClient.user
              .listByService(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                {
                  filter: `email eq '${userEmail}'`
                }
              )
              .then(userList => ({
                apimClient,
                userList
              })),
          error =>
            internalErrorHandler(
              "Could not list the user by email.",
              error as Error
            )
        )
      )
      .chain(
        fromPredicate(
          taskResults => taskResults.userList.length !== 0,
          () =>
            ResponseErrorNotFound(
              "Not found",
              "The provided user does not exist"
            )
        )
      )
      .chain(taskResults =>
        fromEither(NonEmptyString.decode(taskResults.userList[0].id))
          .mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get user id from user contract.",
              errors
            )
          )
          .map(userId => ({
            apimClient: taskResults.apimClient,
            userId
          }))
      )
      .chain(taskResults =>
        tryCatch(
          () =>
            taskResults.apimClient.product.listByService(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              {
                filter: `name eq '${productNamePayload.product_name}'`
              }
            ),
          error =>
            internalErrorHandler(
              "Could not list the products by name.",
              error as Error
            )
        ).map(productList => ({
          apimClient: taskResults.apimClient,
          productList,
          userId: taskResults.userId
        }))
      )
      .chain(
        fromPredicate(
          taskResults => taskResults.productList.length !== 0,
          () =>
            ResponseErrorNotFound(
              "Not found",
              "The provided product does not exist"
            )
        )
      )
      .chain(taskResults =>
        fromEither(NonEmptyString.decode(taskResults.productList[0].id))
          .mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get product id from product contract.",
              errors
            )
          )
          .map(productId => ({
            apimClient: taskResults.apimClient,
            productId,
            userId: taskResults.userId
          }))
      )
      .chain(taskResults =>
        tryCatch(
          () =>
            taskResults.apimClient.subscription.createOrUpdate(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              subscriptionId,
              {
                displayName: subscriptionId,
                ownerId: taskResults.userId,
                scope: `/products/${taskResults.productId}`,
                state: "active"
              }
            ),
          error =>
            internalErrorHandler(
              "Could not create the subscription.",
              error as Error
            )
        )
      )
      .chain(subscriptionResponse =>
        fromEither(
          subscriptionContractToApiSubscription(subscriptionResponse).mapLeft(
            error =>
              internalErrorHandler(
                "Invalid subscription contract from APIM.",
                error
              )
          )
        )
      )
      .map(ResponseSuccessJson)
      .run();
    return response.value;
  };
}

/**
 * Wraps a CreateSubscription handler inside an Express request handler.
 */
export function CreateSubscription(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = CreateSubscriptionHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // TODO:
    //  the following middleware must be replaced with RequiredParamMiddleware after the `withRequestMiddlewares` method will accept more than 6 params
    //  @see: https://www.pivotaltracker.com/story/show/171598976
    // Extract the params from the request
    CreateSubscriptionParamsMiddleware,
    // Extract the productName from the request body
    RequiredBodyPayloadMiddleware(ProductNamePayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
