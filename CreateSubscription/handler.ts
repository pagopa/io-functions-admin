import { Context } from "@azure/functions";
import * as express from "express";
import * as TE from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { Errors } from "io-ts";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorTooManyRequests,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseErrorTooManyRequests,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { flow, identity, pipe } from "fp-ts/lib/function";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { ProductNamePayload } from "../generated/definitions/ProductNamePayload";
import { Subscription } from "../generated/definitions/Subscription";
import {
  getApiClient,
  IAzureApimConfig,
  isErrorStatusCode,
  IServicePrincipalCreds
} from "../utils/apim";
import { subscriptionContractToApiSubscription } from "../utils/conversions";
import {
  genericInternalErrorHandler,
  genericInternalValidationErrorHandler
} from "../utils/errorHandler";
import { CreateSubscriptionParamsMiddleware } from "../utils/middlewares/createSubscriptionParamsMiddleware";
import { withRetry } from "../utils/retry";
import { RestError } from "@azure/ms-rest-js";

type ICreateSubscriptionHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  requestParams: readonly [EmailAddress, NonEmptyString],
  productNamePayload: ProductNamePayload
) => Promise<
  | IResponseSuccessJson<Subscription>
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorTooManyRequests
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-lines-per-function
export function CreateSubscriptionHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): ICreateSubscriptionHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, requestParams, productNamePayload) => {
    const [userEmail, subscriptionId] = requestParams;
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "CreateSubscription | " + errorMessage,
        error,
        errorMessage
      );
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
    return pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.mapLeft(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      ),
      TE.chainW(apimClient =>
        TE.tryCatch(
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
      ),
      TE.chainW(
        TE.fromPredicate(
          taskResults => taskResults.userList.length !== 0,
          () =>
            ResponseErrorNotFound(
              "Not found",
              "The provided user does not exist"
            )
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          taskResults.userList[0].id,
          NonEmptyString.decode,
          TE.fromEither,
          TE.mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get user id from user contract.",
              errors
            )
          ),
          TE.map(userId => ({
            apimClient: taskResults.apimClient,
            userId
          }))
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          TE.tryCatch(
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
          ),
          TE.map(productList => ({
            apimClient: taskResults.apimClient,
            productList,
            userId: taskResults.userId
          }))
        )
      ),
      TE.chainW(
        TE.fromPredicate(
          taskResults => taskResults.productList.length !== 0,
          () =>
            ResponseErrorNotFound(
              "Not found",
              "The provided product does not exist"
            )
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          taskResults.productList[0].id,
          NonEmptyString.decode,
          TE.fromEither,
          TE.mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get product id from product contract.",
              errors
            )
          ),
          TE.map(productId => ({
            apimClient: taskResults.apimClient,
            productId,
            userId: taskResults.userId
          }))
        )
      ),
      TE.chainW(taskResults =>
        pipe(
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
          // It turns out Azure API Management implements optimistic consistency on accounts
          // Hence, when multiple subscriptions are added to the same account concurrently,
          //   this API may return 412.
          // This is an undocumented behaviour that arose in production.
          // In accordance with Azure support, we decided to retry the request on such case
          withRetry({
            delayMS: 200,
            maxAttempts: 3,
            whileCondition: f => {
              const is412 = isErrorStatusCode(f, 412);
              context.log.error(
                `CreateSubscription | troubleshooting | whileCondition | ${is412} | ${f instanceof
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  Error} | ${f instanceof RestError} | ${(f || {}).message} | ${
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  (f || {}).statusCode
                } | `
              );
              return isErrorStatusCode(f, 412);
            }
          }),
          retrieable => TE.tryCatch(retrieable, identity),
          // If we get 412 even after retries, we respond with a too may request status
          //   so we ask the client to retry by itself
          TE.mapLeft(error => {
            const is412 = isErrorStatusCode(error, 412);
            context.log.error(
              `CreateSubscription | troubleshooting | mapLeft | ${is412} | ${error instanceof
                Error} | ${error instanceof RestError}`
            );
            return is412
              ? ResponseErrorTooManyRequests()
              : internalErrorHandler(
                  "Could not create the subscription.",
                  error as Error
                );
          })
        )
      ),
      TE.chainW(
        flow(
          subscriptionContractToApiSubscription,
          TE.fromEither,
          TE.mapLeft(error =>
            internalErrorHandler(
              "Invalid subscription contract from APIM.",
              error
            )
          )
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a CreateSubscription handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
