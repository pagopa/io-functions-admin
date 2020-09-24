import { ApiManagementClient } from "@azure/arm-apimanagement";
import { SubscriptionContract } from "@azure/arm-apimanagement/esm/models";
import { Context } from "@azure/functions";
import * as express from "express";
import { sequenceT } from "fp-ts/lib/Apply";
import { array } from "fp-ts/lib/Array";
import { either, isRight, toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromPredicate,
  taskEither,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import { withRequestMiddlewares } from "io-functions-commons/dist/src/utils/request_middleware";
import { Errors } from "io-ts";
import { wrapRequestHandler } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

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

function getUserSubscriptions(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TaskEither<Error, ReadonlyArray<SubscriptionContract>> {
  return tryCatch(async () => {
    // tslint:disable-next-line:readonly-array no-let
    const subscriptionList: SubscriptionContract[] = [];
    const subscriptionListResponse = await apimClient.userSubscription.list(
      apimResourceGroup,
      apim,
      userName
    );
    subscriptionList.push(...subscriptionListResponse);
    // tslint:disable-next-line:no-let
    let nextLink = subscriptionListResponse.nextLink;
    while (nextLink) {
      const nextSubscriptionList = await apimClient.userSubscription.listNext(
        nextLink
      );
      subscriptionList.push(...nextSubscriptionList);
      nextLink = nextSubscriptionList.nextLink;
    }
    return subscriptionList;
  }, toError);
}

export function GetUserHandler(
  adb2cCredentials: IServicePrincipalCreds,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  adb2cTokenAttributeName: NonEmptyString
): IGetSubscriptionKeysHandler {
  return async (context, _, email) => {
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "GetUsers | " + errorMessage,
        error,
        errorMessage
      );
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
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      )
      .chain(apiClient =>
        tryCatch(
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
      )
      .chain(
        fromPredicate(
          taskResults => taskResults.userList.length !== 0,
          () =>
            ResponseErrorNotFound(
              "Not found",
              "The required resource does not exist"
            )
        )
      )
      .chain(taskResults =>
        fromEither(NonEmptyString.decode(taskResults.userList[0].name))
          .mapLeft(errors =>
            internalValidationErrorHandler(
              "Could not get user name from user contract.",
              errors
            )
          )
          .map(userName => ({
            apiClient: taskResults.apiClient,
            userName
          }))
      )
      .chain(taskResults =>
        sequenceT(taskEither)(
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
        ).mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(error =>
          internalErrorHandler(
            "Could not get user groups and subscriptions from APIM.",
            error
          )
        )
      )
      .map(contractLists => {
        const [groupContracts, subscriptionContracts] = contractLists;
        const errorOrGroups = array.traverse(either)(
          [...groupContracts],
          groupContractToApiGroup
        );
        const errorOrSubscriptions = array.traverse(either)(
          [...subscriptionContracts],
          subscriptionContractToApiSubscription
        );
        return { errorOrGroups, errorOrSubscriptions };
      })
      .chain(taskResults =>
        getGraphRbacManagementClient(adb2cCredentials)
          .mapLeft(error =>
            internalErrorHandler("Could not get the ADB2C client", error)
          )
          .chain(client =>
            tryCatch(
              () =>
                client.users.list({
                  filter: `signInNames/any(x:x/value eq '${email}')`
                }),
              error =>
                internalErrorHandler(
                  "Could not get user by email.",
                  error as Error
                )
            ).map(userList => userList[0])
          )
          .map(adb2User => {
            return {
              ...taskResults,
              token_name: adb2User[`${adb2cTokenAttributeName}`]
            };
          })
      )
      .chain(
        fromPredicate(
          userInfo => isRight(userInfo.errorOrGroups),
          userInfoWithError =>
            internalErrorHandler(
              "Invalid group contract from APIM.",
              userInfoWithError.errorOrGroups.value as Error
            )
        )
      )
      .chain(
        fromPredicate(
          userInfo => isRight(userInfo.errorOrSubscriptions),
          userInfoWithError =>
            internalErrorHandler(
              "Invalid subscription contract from APIM.",
              userInfoWithError.errorOrSubscriptions.value as Error
            )
        )
      )
      .chain(userInfo =>
        fromEither(
          UserInfo.decode({
            groups: userInfo.errorOrGroups.value,
            subscriptions: userInfo.errorOrSubscriptions.value,
            token_name: userInfo.token_name
          })
            .mapLeft(errors =>
              internalValidationErrorHandler(
                "Invalid response payload.",
                errors
              )
            )
            .map(ResponseSuccessJson)
        )
      )
      .run();
    return response.value;
  };
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */
export function GetUser(
  adb2cCredentials: IServicePrincipalCreds,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  adb2cTokenAttributeName: NonEmptyString
): express.RequestHandler {
  const handler = GetUserHandler(
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
