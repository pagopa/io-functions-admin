import { Context } from "@azure/functions";
import { ApiManagementClient } from "@azure/arm-apimanagement";

import * as express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { withRequestMiddlewares } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { getGraphRbacManagementClient } from "../utils/apim";
import { genericInternalErrorHandler } from "../utils/errorHandler";
import { UpdateSubscriptionOwnerPayload } from "../generated/definitions/UpdateSubscriptionOwnerPayload";

const getUserByEmail = (
  apimClient: ApiManagementClient,
  userEmail: NonEmptyString
) =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.user.listByService(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          {
            filter: `email eq '${userEmail}'`
          }
        ),
      E.toError
    ),
    TE.chain(
      TE.fromPredicate(
        results => results.length > 0,
        () => new Error("Cannot find user by email")
      )
    ),
    TE.map(_ => _[0])
  );

const getSubscription = (
  apimClient: ApiManagementClient,
  subscriptionId: string
) =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.get(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          subscriptionId
        ),
      toError
    )
  );

const applValidation = AR.sequence(
  TE.getApplicativeTaskValidation(T.ApplicativePar, AR.getSemigroup<Error>())
);
const updateSubscriptionOwner = (
  apimClient: ApiManagementClient,
  subscription: SubscriptionGetResponse,
  destinationOwnerId: string
) =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.createOrUpdate(
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          subscription.name,
          {
            ownerId: destinationOwnerId,
            scope: subscription.scope,
            displayName: subscription.displayName
          }
        ),
      toError
    ),
    TE.map(
      () =>
        `Update subscription ${subscription.name} with ownerId ${destinationOwnerId}`
    )
  );

const mergeFn = (te: T.Task<Either<Error, string>[]>) =>
  T.ApplicativePar.map(te, e =>
    e.reduce(
      (acc, cur) => {
        // our reducer is still pure, as we pass fresh object literal as initial value
        isLeft(cur)
          ? acc.errors.push(cur.left.message)
          : acc.results.push(cur.right);
        return acc;
      },
      { errors: [], results: [] }
    )
  );

const test = (
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  servicesToMigrate: ReadonlyArray<string>,
  orig_email: string = "l.franceschin@gmail.com",
  dest_email: string = "postaforum@gmail.com"
) =>
  pipe(
    getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
    TE.chain(apimClient =>
      pipe(
        getUserByEmail(apimClient, orig_email),
        TE.chain(_ =>
          pipe(
            getUserByEmail(apimClient, dest_email),
            TE.map(__ => ({ origine: _, destinazione: __ }))
          )
        ),
        TE.chain(_ =>
          pipe(
            AR.sequence(T.ApplicativePar)(
              servicesToMigrate.map(serviceId =>
                pipe(
                  getSubscription(apimClient, serviceId),
                  TE.mapLeft(
                    e =>
                      new Error(
                        `ERROR|${e.message} SubscriptionId = ${serviceId}`
                      )
                  ),
                  TE.map(subscription => ({ ..._, subscription })),
                  TE.chain(
                    TE.fromPredicate(
                      _ => _.origine.id === _.subscription.ownerId,
                      _ =>
                        new Error(
                          `ERROR|Subscription ${_.subscription.name} is not owned by ${_.origine.email}`
                        )
                    )
                  ),
                  TE.chain(_ =>
                    updateSubscriptionOwner(
                      apimClient,
                      _.subscription,
                      _.destinazione.id
                    )
                  )
                )
              )
            ),
            mergeFn,
            TE.fromTask
          )
        )
      )
    )
  );

type IUpdateSubscriptionOwnerHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  subscriptionId: NonEmptyString,
  payload: UpdateSubscriptionOwnerPayload
) => Promise<IResponseSuccessJson<void> | IResponseErrorInternal>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionOwnerHandler(): IUpdateSubscriptionOwnerHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, subscriptionId, payload) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "UpdateUser| " + errorMessage,
        error,
        errorMessage
      );
    const p = pipe(
      getGraphRbacManagementClient(adb2cCredentials),
      TE.mapLeft(error =>
        internalErrorHandler("Could not get the ADB2C client", error)
      ),
      TE.chain(graphRbacManagementClient =>
        pipe(
          getUserFromList(graphRbacManagementClient, email),
          TE.mapLeft(userFromListError =>
            internalErrorHandler(
              "Could not retrieve user from list on the ADB2C",
              userFromListError
            )
          ),
          TE.chain(user =>
            pipe(
              updateUser(
                graphRbacManagementClient,
                email,
                user,
                adb2cTokenAttributeName,
                userPayload
              ),
              TE.mapLeft(updateUserError =>
                internalErrorHandler(
                  "Could not update the user on the ADB2C",
                  new Error(JSON.stringify(updateUserError))
                )
              )
            )
          )
        )
      ),
      TE.map(updatedUser => ResponseSuccessJson(updatedUser)),
      TE.toUnion
    )();

    return ResponseSuccessJson(void 0);
  };
}

/**
 * Wraps an UpdateUser handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateSubscriptionOwner(): express.RequestHandler {
  const handler = UpdateSubscriptionOwnerHandler();

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the subscriptionId value from the request
    RequiredParamMiddleware("subscriptionId", NonEmptyString),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(UpdateSubscriptionOwnerPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
