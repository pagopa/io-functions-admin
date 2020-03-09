import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GroupContract } from "@azure/arm-apimanagement/esm/models";
import { Context } from "@azure/functions";
import * as express from "express";
import { sequenceT } from "fp-ts/lib/Apply";
import { array } from "fp-ts/lib/Array";
import { either, toError } from "fp-ts/lib/Either";
import {
  fromEither,
  fromPredicate,
  taskEither,
  TaskEither,
  taskEitherSeq,
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
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { GroupCollection } from "../generated/definitions/GroupCollection";
import { UserGroupsPayload } from "../generated/definitions/UserGroupsPayload";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { groupContractToApiGroup } from "../utils/conversions";
import { genericInternalErrorHandler } from "../utils/errorHandler";

type IGetSubscriptionKeysHandlerResponseError =
  | IResponseErrorNotFound
  | IResponseErrorInternal
  | IResponseErrorValidation;
type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
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
    // tslint:disable-next-line:readonly-array no-let
    const groupList: GroupContract[] = [];
    const groupListResponse = await apimClient.group.listByService(
      apimResourceGroup,
      apim
    );
    groupList.push(...groupListResponse);
    // tslint:disable-next-line:no-let
    let nextLink = groupListResponse.nextLink;
    while (nextLink) {
      const nextGroupList = await apimClient.group.listByServiceNext(nextLink);
      groupList.push(...nextGroupList);
      nextLink = nextGroupList.nextLink;
    }
    return groupList;
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

export function UpdateUserGroupHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  return async (context, _, __, ___, email, userGroupsPayload) => {
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
            existingGroups: groupList.reduce(
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
          .mapLeft(error => internalErrorHandler("Invalid groups", error))
          .map(() => taskResults)
      )
      .chain(taskResults => {
        interface IGroupsClusterization {
          toBeAssociated: ReadonlyArray<string>;
          toBeRemoved: ReadonlyArray<string>;
        }
        const groupsClusterization = Object.keys(
          taskResults.existingGroups
        ).reduce<IGroupsClusterization>(
          (cluster, group) => {
            if (
              taskResults.currentUserGroups.includes(group) &&
              !userGroupsPayload.groups.includes(group)
            ) {
              return {
                toBeAssociated: cluster.toBeAssociated,
                toBeRemoved: cluster.toBeRemoved.concat([
                  taskResults.existingGroups[group]
                ])
              };
            }
            if (
              !taskResults.currentUserGroups.includes(group) &&
              userGroupsPayload.groups.includes(group)
            ) {
              return {
                toBeAssociated: cluster.toBeAssociated.concat([
                  taskResults.existingGroups[group]
                ]),
                toBeRemoved: cluster.toBeRemoved
              };
            }
            return cluster;
          },
          { toBeAssociated: [], toBeRemoved: [] }
        );
        const errorOrUserContractsWithAssociatedGroups = array.traverse(
          taskEitherSeq
        )([...groupsClusterization.toBeAssociated], groupId =>
          tryCatch(
            () =>
              taskResults.apimClient.groupUser.create(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                groupId,
                taskResults.userName
              ),
            toError
          )
        );
        const errorOrUserContractsWithNotAssociatedGroups = array.traverse(
          taskEitherSeq
        )([...groupsClusterization.toBeRemoved], groupId =>
          tryCatch(
            () =>
              taskResults.apimClient.groupUser.deleteMethod(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                groupId,
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
  serviceModel: ServiceModel,
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
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the user email from the URL path
    RequiredParamMiddleware("email", EmailAddress),
    // Extract the user groups payload from the request body
    RequiredBodyPayloadMiddleware(UserGroupsPayload)
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___, ____) =>
        ipTuple(c, u)
      )
    )
  );
}
