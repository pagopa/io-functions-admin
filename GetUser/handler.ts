import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  GroupContract,
  SubscriptionContract
} from "@azure/arm-apimanagement/esm/models";
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
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import {
  AzureUserAttributesMiddleware,
  IAzureUserAttributes
} from "io-functions-commons/dist/src/utils/middlewares/azure_user_attributes";
import {
  ClientIp,
  ClientIpMiddleware
} from "io-functions-commons/dist/src/utils/middlewares/client_ip_middleware";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { withRequestMiddlewares } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";
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
import { EmailMiddleware } from "../utils/middlewares/email";

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
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

function getUserGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TaskEither<Error, ReadonlyArray<GroupContract>> {
  return tryCatch(async () => {
    // tslint:disable-next-line:readonly-array no-let
    const groupList: GroupContract[] = [];
    const groupListResponse = await apimClient.userGroup.list(
      apimResourceGroup,
      apim,
      userName
    );
    groupList.push(...groupListResponse);
    // tslint:disable-next-line:no-let
    let nextLink = groupListResponse.nextLink;
    while (nextLink) {
      const nextGroupList = await apimClient.userGroup.listNext(nextLink);
      groupList.push(...nextGroupList);
      nextLink = nextGroupList.nextLink;
    }
    return groupList;
  }, toError);
}

export function GetUserHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, __, ___, email) => {
    const genericErrorMessage = "An error occurred while getting the user info";
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
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
          toError
        )
      )
      .mapLeft<IResponseErrorInternal | IResponseErrorNotFound>(error =>
        genericInternalErrorHandler(
          context,
          "GetUsers | Could not list the user by email.",
          error,
          genericErrorMessage
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
            genericInternalValidationErrorHandler(
              context,
              "GetUser | Could not get user name from user contract.",
              errors,
              genericErrorMessage
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
          genericInternalErrorHandler(
            context,
            "GetUsers | Could not get user groups and subscriptions from APIM.",
            error,
            genericErrorMessage
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
      .chain(
        fromPredicate(
          userInfo => isRight(userInfo.errorOrGroups),
          userInfoWithError =>
            genericInternalErrorHandler(
              context,
              "GetUser | Invalid group contract from APIM.",
              userInfoWithError.errorOrGroups.value as Error,
              genericErrorMessage
            )
        )
      )
      .chain(
        fromPredicate(
          userInfo => isRight(userInfo.errorOrSubscriptions),
          userInfoWithError =>
            genericInternalErrorHandler(
              context,
              "GetUser | Invalid subscription contract from APIM.",
              userInfoWithError.errorOrSubscriptions.value as Error,
              genericErrorMessage
            )
        )
      )
      .chain(userInfo =>
        fromEither(
          UserInfo.decode({
            groups: userInfo.errorOrGroups.value,
            subscriptions: userInfo.errorOrSubscriptions.value
          })
            .mapLeft(errors =>
              genericInternalValidationErrorHandler(
                context,
                "GetUsers | Invalid response payload",
                errors,
                genericErrorMessage
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
  serviceModel: ServiceModel,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = GetUserHandler(servicePrincipalCreds, azureApimConfig);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extract the email value from the request
    EmailMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
