/* eslint-disable max-lines-per-function */
import { ApiManagementClient, GroupContract } from "@azure/arm-apimanagement";
import { Context } from "@azure/functions";
import * as express from "express";
import { sequenceT } from "fp-ts/lib/Apply";

import * as S from "fp-ts/lib/string";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as RMAP from "fp-ts/lib/ReadonlyMap";

import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";
import { asyncIteratorToArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function getGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string
): TE.TaskEither<Error, ReadonlyArray<GroupContract>> {
  return TE.tryCatch(
    () =>
      asyncIteratorToArray(
        apimClient.group.listByService(apimResourceGroup, apim)
      ),
    E.toError
  );
}

interface IGroupsClusterization {
  readonly toBeAssociated: ReadonlyArray<string>;
  readonly toBeRemoved: ReadonlyArray<string>;
}

/**
 * Returns a clusterization of the group names on which an operation from the APIM client must be performed.
 *
 * @param existingGroups The record of the existing group names on the APIM, indexed by their displayNames
 * @param currentUserGroups The list of displayNames of the groups with which the user is currently associated
 * @param groupsInPayload The list of displayNames of the groups with which the user must be associated
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function clusterizeGroups(
  existingGroups: Record<string, string>,
  currentUserGroups: ReadonlyArray<string>,
  groupsInPayload: ReadonlyArray<string>
): IGroupsClusterization {
  return pipe(
    Object.entries(existingGroups),
    _ => new Map(_),
    RMAP.reduceWithIndex(S.Ord)(
      {
        toBeAssociated: [] as ReadonlyArray<string>,
        toBeRemoved: [] as ReadonlyArray<string>
      },
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
    )
  );
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-lines-per-function
export function UpdateUserGroupHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, email, userGroupsPayload) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "UpdateUser | " + errorMessage,
        error,
        errorMessage
      );

    return await pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.mapLeft(error =>
        internalErrorHandler("Could not get the APIM client.", error)
      ),
      TE.chain(apimClient =>
        pipe(
          TE.tryCatch(
            () =>
              asyncIteratorToArray(
                apimClient.user.listByService(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  {
                    filter: `email eq '${email}'`
                  }
                )
              ),
            error =>
              internalErrorHandler(
                "Could not list the user by email.",
                error as Error
              )
          ),
          TE.map(userList => ({
            apimClient,
            userList
          }))
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
      TE.map(taskResults => ({
        apimClient: taskResults.apimClient,
        userName: taskResults.userList[0].name
      })),
      TE.chainW(taskResults =>
        pipe(
          taskResults.userName,
          NonEmptyString.decode,
          TE.fromEither,
          TE.mapLeft(errors => {
            const errorMessage = "Could not get user name from user contract.";
            return genericInternalValidationErrorHandler(
              context,
              "UpdateUser | " + errorMessage,
              errors,
              errorMessage
            );
          }),
          TE.map(() => ({
            apimClient: taskResults.apimClient,
            userName: taskResults.userName
          }))
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          getUserGroups(
            taskResults.apimClient,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            // TODO: Implement a validation step to ensure the existence of `userName`.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            taskResults.userName
          ),
          TE.mapLeft(error =>
            internalErrorHandler("Could not get the user groups.", error)
          ),
          TE.map(currentUserGroups => ({
            apimClient: taskResults.apimClient,
            currentUserGroups: currentUserGroups.map(
              // The displayNames values with which the user is currently associated
              // will be matched with the values in the request payload
              groupContract => groupContract.displayName
            ),
            userName: taskResults.userName
          }))
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          getGroups(
            taskResults.apimClient,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim
          ),
          TE.mapLeft(error =>
            internalErrorHandler("Could not list the groups", error)
          ),
          TE.map(groupList => ({
            apimClient: taskResults.apimClient,
            currentUserGroups: taskResults.currentUserGroups,
            existingGroups: groupList.reduce<Record<string, string>>(
              // TODO: Implement a validation step to ensure the existence of `curr.name`.
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              (prev, curr) => ({ ...prev, [curr.displayName]: curr.name }),
              {}
            ),
            userName: taskResults.userName
          }))
        )
      ),
      TE.chainW(taskResults =>
        pipe(
          [...userGroupsPayload.groups],
          A.traverse(TE.ApplicativePar)(
            TE.fromPredicate(
              // TODO: Add validation
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              groupName => taskResults.existingGroups[groupName] !== undefined,
              __ => ResponseErrorValidation("Bad request", "Invalid groups")
            )
          ),
          TE.map(() => taskResults)
        )
      ),
      TE.chainW(taskResults => {
        const groupsClusterization = clusterizeGroups(
          // TODO: Add validation
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          taskResults.existingGroups,
          taskResults.currentUserGroups as ReadonlyArray<string>,
          userGroupsPayload.groups
        );
        const errorOrUserContractsWithAssociatedGroups = pipe(
          [...groupsClusterization.toBeAssociated],
          A.traverse(TE.ApplicativeSeq)(groupName =>
            TE.tryCatch(
              () =>
                taskResults.apimClient.groupUser.create(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  groupName,
                  // TODO: Add validation
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  taskResults.userName
                ),
              E.toError
            )
          )
        );

        const errorOrUserContractsWithNotAssociatedGroups = pipe(
          [...groupsClusterization.toBeRemoved],
          A.traverse(TE.ApplicativeSeq)(groupName =>
            TE.tryCatch(
              () =>
                taskResults.apimClient.groupUser.delete(
                  azureApimConfig.apimResourceGroup,
                  azureApimConfig.apim,
                  groupName,
                  // TODO Add validation
                  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                  // @ts-ignore
                  taskResults.userName
                ),
              E.toError
            )
          )
        );
        return pipe(
          sequenceT(TE.ApplicativeSeq)(
            errorOrUserContractsWithAssociatedGroups,
            errorOrUserContractsWithNotAssociatedGroups
          ),
          TE.mapLeft(error =>
            internalErrorHandler(
              "Could not update the groups associated to the user",
              error
            )
          ),
          TE.map(() => ({
            apimClient: taskResults.apimClient,
            userName: taskResults.userName
          }))
        );
      }),
      TE.chainW(taskResults =>
        pipe(
          getUserGroups(
            taskResults.apimClient,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            // TODO: Add validation
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            taskResults.userName
          ),
          TE.mapLeft(error =>
            internalErrorHandler(
              "Could not get the user groups after updating them.",
              error
            )
          )
        )
      ),
      TE.chainW(groupContracts =>
        pipe(
          [...groupContracts],
          A.traverse(E.Applicative)(groupContractToApiGroup),
          TE.fromEither,
          TE.mapLeft(error =>
            internalErrorHandler("Invalid user groups after updating", error)
          )
        )
      ),
      TE.map(updatedUserGroups =>
        ResponseSuccessJson({ items: updatedUserGroups })
      ),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a GetSubscriptionsKeys handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
