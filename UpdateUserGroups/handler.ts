import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GroupContract } from "@azure/arm-apimanagement/esm/models";
import { Context } from "@azure/functions";
import * as express from "express";
import { sequenceT } from "fp-ts/lib/Apply";
import { array } from "fp-ts/lib/Array";
import { either, toError } from "fp-ts/lib/Either";
import { StrMap } from "fp-ts/lib/StrMap";
import {
  fromEither,
  fromPredicate,
  taskEither,
  TaskEither,
  taskEitherSeq,
  tryCatch
} from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { GroupCollection } from "../generated/definitions/GroupCollection";
import { UserGroupsPayload } from "../generated/definitions/UserGroupsPayload";
import {
  getApiClient,
  getUserGroups,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { groupContractToApiGroup } from "../utils/conversions";
import {
  genericInternalErrorHandler,
  genericInternalValidationErrorHandler
} from "../utils/errorHandler";

type IGetSubscriptionKeysHandlerResponseError =
  | IResponseErrorNotFound
  | IResponseErrorInternal
  | IResponseErrorValidation;
type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  email: EmailAddress,
  userGroupsPayload: UserGroupsPayload
) => Promise<
  | IResponseSuccessJson<GroupCollection>
  | IGetSubscriptionKeysHandlerResponseError
>;

function getGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string
): TaskEither<Error, ReadonlyArray<GroupContract>> {
  return tryCatch(async () => {
    // eslint-disable-next-line functional/prefer-readonly-type, functional/no-let
    const groupList: GroupContract[] = [];
    const groupListResponse = await apimClient.group.listByService(
      apimResourceGroup,
      apim
    );
    groupList.push(...groupListResponse);
    // eslint-disable-next-line functional/no-let
    let nextLink = groupListResponse.nextLink;
    while (nextLink) {
      const nextGroupList = await apimClient.group.listByServiceNext(nextLink);
      groupList.push(...nextGroupList);
      nextLink = nextGroupList.nextLink;
    }
    return groupList;
  }, toError);
}

interface IGroupsClusterization {
  toBeAssociated: ReadonlyArray<string>;
  toBeRemoved: ReadonlyArray<string>;
}

/**
 * Returns a clusterization of the group names on which an operation from the APIM client must be performed.
 * @param existingGroups The record of the existing group names on the APIM, indexed by their displayNames
 * @param currentUserGroups The list of displayNames of the groups with which the user is currently associated
 * @param groupsInPayload The list of displayNames of the groups with which the user must be associated
 */
function clusterizeGroups(
  existingGroups: Record<string, string>,
  currentUserGroups: ReadonlyArray<string>,
  groupsInPayload: ReadonlyArray<string>
): IGroupsClusterization {
  return new StrMap(existingGroups).reduceWithKey(
    { toBeAssociated: [], toBeRemoved: [] },
    (displayName, cluster, name) => {
      if (
        currentUserGroups.includes(displayName) &&
        !groupsInPayload.includes(displayName)
      ) {
        return {
          toBeAssociated: cluster.toBeAssociated,
          toBeRemoved: cluster.toBeRemoved.concat([name])
        };
      }
      if (
        !currentUserGroups.includes(displayName) &&
        groupsInPayload.includes(displayName)
      ) {
        return {
          toBeAssociated: cluster.toBeAssociated.concat([
            existingGroups[displayName]
          ]),
          toBeRemoved: cluster.toBeRemoved
        };
      }
      return cluster;
    }
  );
}

export function UpdateUserGroupHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, email, userGroupsPayload) => {
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "UpdateUser | " + errorMessage,
        error,
        errorMessage
      );
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .mapLeft<IGetSubscriptionKeysHandlerResponseError>(error =>
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
                  filter: `email eq '${email}'`
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
      .map(taskResults => ({
        apimClient: taskResults.apimClient,
        userName: taskResults.userList[0].name
      }))
      .chain(taskResults =>
        fromEither(NonEmptyString.decode(taskResults.userName))
          .mapLeft(errors => {
            const errorMessage = "Could not get user name from user contract.";
            return genericInternalValidationErrorHandler(
              context,
              "UpdateUser | " + errorMessage,
              errors,
              errorMessage
            );
          })
          .map(() => ({
            apimClient: taskResults.apimClient,
            userName: taskResults.userName
          }))
      )
      .chain(taskResults =>
        getUserGroups(
          taskResults.apimClient,
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          taskResults.userName
        )
          .mapLeft(error =>
            internalErrorHandler("Could not get the user groups.", error)
          )
          .map(currentUserGroups => ({
            apimClient: taskResults.apimClient,
            currentUserGroups: currentUserGroups.map(
              // The displayNames values with which the user is currently associated
              // will be matched with the values in the request payload
              groupContract => groupContract.displayName
            ),
            userName: taskResults.userName
          }))
      )
      .chain(taskResults =>
        getGroups(
          taskResults.apimClient,
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim
        )
          .mapLeft(error =>
            internalErrorHandler("Could not list the groups", error)
          )
          .map(groupList => ({
            apimClient: taskResults.apimClient,
            currentUserGroups: taskResults.currentUserGroups,
            existingGroups: groupList.reduce<Record<string, string>>(
              (prev, curr) => ({ ...prev, [curr.displayName]: curr.name }),
              {}
            ),
            userName: taskResults.userName
          }))
      )
      .chain(taskResults =>
        array
          .traverse(taskEither)(
            [...userGroupsPayload.groups],
            fromPredicate(
              groupName => taskResults.existingGroups[groupName] !== undefined,
              groupName => Error(`Provided group not found: ${groupName}`)
            )
          )
          .mapLeft(() =>
            ResponseErrorValidation("Bad request", "Invalid groups")
          )
          .map(() => taskResults)
      )
      .chain(taskResults => {
        const groupsClusterization = clusterizeGroups(
          taskResults.existingGroups,
          taskResults.currentUserGroups,
          userGroupsPayload.groups
        );
        const errorOrUserContractsWithAssociatedGroups = array.traverse(
          taskEitherSeq
        )([...groupsClusterization.toBeAssociated], groupName =>
          tryCatch(
            () =>
              taskResults.apimClient.groupUser.create(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                groupName,
                taskResults.userName
              ),
            toError
          )
        );
        const errorOrUserContractsWithNotAssociatedGroups = array.traverse(
          taskEitherSeq
        )([...groupsClusterization.toBeRemoved], groupName =>
          tryCatch(
            () =>
              taskResults.apimClient.groupUser.deleteMethod(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                groupName,
                taskResults.userName
              ),
            toError
          )
        );
        return sequenceT(taskEitherSeq)(
          errorOrUserContractsWithAssociatedGroups,
          errorOrUserContractsWithNotAssociatedGroups
        )
          .mapLeft(error =>
            internalErrorHandler(
              "Could not update the groups associated to the user",
              error
            )
          )
          .map(() => ({
            apimClient: taskResults.apimClient,
            userName: taskResults.userName
          }));
      })
      .chain(taskResults =>
        getUserGroups(
          taskResults.apimClient,
          azureApimConfig.apimResourceGroup,
          azureApimConfig.apim,
          taskResults.userName
        ).mapLeft(error =>
          internalErrorHandler(
            "Could not get the user groups after updating them.",
            error
          )
        )
      )
      .chain(groupContracts =>
        fromEither(
          array.traverse(either)([...groupContracts], groupContractToApiGroup)
        ).mapLeft(error =>
          internalErrorHandler("Invalid user groups after updating", error)
        )
      )
      .map(updatedUserGroups =>
        ResponseSuccessJson({ items: updatedUserGroups })
      )
      .run();
    return response.value;
  };
}

/**
 * Wraps a GetSubscriptionsKeys handler inside an Express request handler.
 */
export function UpdateUserGroup(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = UpdateUserGroupHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceKeyRead group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extracts the user email from the URL path
    RequiredParamMiddleware("email", EmailAddress),
    // Extract the user groups payload from the request body
    RequiredBodyPayloadMiddleware(UserGroupsPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
