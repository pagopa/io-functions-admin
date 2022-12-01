import { ApiManagementClient } from "@azure/arm-apimanagement";
import { SubscriptionContract } from "@azure/arm-apimanagement/esm/models";
import { Context } from "@azure/functions";
import * as express from "express";
import { pipe } from "fp-ts/lib/function";
import { sequenceT } from "fp-ts/lib/Apply";
import * as A from "fp-ts/lib/Array";
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
import { Errors } from "io-ts";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { EmailAddress } from "../generated/definitions/EmailAddress";
import { UserInfo } from "../generated/definitions/UserInfo";
import {
  getApiClient,
  getGraphRbacManagementClient,
  getUserGroups,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import {
  groupContractToApiGroup,
  subscriptionContractToApiSubscription
} from "../utils/conversions";
import {
  genericInternalErrorHandler,
  genericInternalValidationErrorHandler
} from "../utils/errorHandler";

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  email: EmailAddress
) => Promise<
  | IResponseSuccessJson<UserInfo>
  | IResponseErrorInternal
  | IResponseErrorNotFound
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function getUserSubscriptions(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TE.TaskEither<Error, ReadonlyArray<SubscriptionContract>> {
  return TE.tryCatch(async () => {
    // eslint-disable-next-line functional/prefer-readonly-type, functional/no-let
    const subscriptionList: SubscriptionContract[] = [];
    const subscriptionListResponse = await apimClient.userSubscription.list(
      apimResourceGroup,
      apim,
      userName
    );
    // eslint-disable-next-line functional/immutable-data
    subscriptionList.push(...subscriptionListResponse);
    // eslint-disable-next-line functional/no-let
    let nextLink = subscriptionListResponse.nextLink;
    while (nextLink) {
      const nextSubscriptionList = await apimClient.userSubscription.listNext(
        nextLink
      );
      // eslint-disable-next-line functional/immutable-data
      subscriptionList.push(...nextSubscriptionList);
      nextLink = nextSubscriptionList.nextLink;
    }
    return subscriptionList;
  }, E.toError);
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetUserSubscriptionsHandler(
  adb2cCredentials: IServicePrincipalCreds,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  adb2cTokenAttributeName: NonEmptyString
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, email) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "GetUsers | " + errorMessage,
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
        "GetUsers | " + errorMessage,
        errors,
        errorMessage
      );
    return pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.mapLeft(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      ),
      TE.chain(apiClient =>
        TE.tryCatch(
          () =>
            apiClient.user
              .listByService(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                {
                  filter: `email eq '${email}'`
                }
              )
              .then(userList => ({
                apiClient,
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
              "The required resource does not exist"
            )
        )
      ),
      TE.chain(taskResults =>
        pipe(
          taskResults.userList[0].name,
          NonEmptyString.decode,
          E.mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get user name from user contract.",
              errors
            )
          ),
          E.map(userName => ({
            apiClient: taskResults.apiClient,
            userName
          })),
          TE.fromEither
        )
      ),
      TE.chain(taskResults =>
        pipe(
          sequenceT(TE.ApplicativePar)(
            getUserGroups(
              taskResults.apiClient,
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              taskResults.userName
            ),
            getUserSubscriptions(
              taskResults.apiClient,
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              taskResults.userName
            )
          ),
          TE.mapLeft(error =>
            internalErrorHandler(
              "Could not get user groups and subscriptions from APIM.",
              error
            )
          )
        )
      ),
      TE.map(contractLists => {
        const [groupContracts, subscriptionContracts] = contractLists;
        const errorOrGroups = A.traverse(E.Applicative)(
          groupContractToApiGroup
        )([...groupContracts]);
        const errorOrSubscriptions = A.traverse(E.Applicative)(
          subscriptionContractToApiSubscription
        )([...subscriptionContracts]);
        return { errorOrGroups, errorOrSubscriptions };
      }),
      TE.chain(taskResults =>
        pipe(
          getGraphRbacManagementClient(adb2cCredentials),
          TE.mapLeft(error =>
            internalErrorHandler("Could not get the ADB2C client", error)
          ),
          TE.chain(client =>
            TE.tryCatch(
              () =>
                client.users.list({
                  filter: `signInNames/any(x:x/value eq '${email}')`
                }),
              error =>
                internalErrorHandler(
                  "Could not get user by email.",
                  error as Error
                )
            )
          ),
          TE.map(([adb2User]) => ({
            ...taskResults,
            token_name: adb2User[`${adb2cTokenAttributeName}`]
          }))
        )
      ),
      TE.chain(userInfo =>
        E.isRight(userInfo.errorOrGroups)
          ? TE.of(userInfo)
          : TE.left(
              internalErrorHandler(
                "Invalid group contract from APIM.",
                userInfo.errorOrGroups.left
              )
            )
      ),
      TE.chain(userInfo =>
        E.isRight(userInfo.errorOrSubscriptions)
          ? TE.of(userInfo)
          : TE.left(
              internalErrorHandler(
                "Invalid subscription contract from APIM.",
                userInfo.errorOrSubscriptions.left
              )
            )
      ),
      TE.chain(userInfo =>
        pipe(
          {
            // TODO: as both errorOrGroups and errorOrSubscriptions cannot be Left because of the previous checks,
            //  let's refactor to include such info in the type system
            groups: E.toUnion(userInfo.errorOrGroups),
            subscriptions: E.toUnion(userInfo.errorOrSubscriptions),
            token_name: userInfo.token_name
          },
          UserInfo.decode,
          E.mapLeft(errors =>
            internalValidationErrorHandler("Invalid response payload.", errors)
          ),
          E.map(ResponseSuccessJson),
          TE.fromEither
        )
      ),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetUserSubscriptions(
  adb2cCredentials: IServicePrincipalCreds,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  adb2cTokenAttributeName: NonEmptyString
): express.RequestHandler {
  const handler = GetUserSubscriptionsHandler(
    adb2cCredentials,
    servicePrincipalCreds,
    azureApimConfig,
    adb2cTokenAttributeName
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the email value from the request
    RequiredParamMiddleware("email", EmailAddress)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
