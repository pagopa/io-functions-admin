import { Context } from "@azure/functions";
import { GraphRbacManagementClient } from "@azure/graph";
import * as express from "express";
import { toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredBodyPayloadMiddleware } from "io-functions-commons/dist/src/utils/middlewares/required_body_payload";
import { withRequestMiddlewares } from "io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { withoutUndefinedValues } from "italia-ts-commons/lib/types";
import { UserCreated } from "../generated/definitions/UserCreated";
import { UserPayload } from "../generated/definitions/UserPayload";
import {
  getGraphRbacManagementClient,
  IServicePrincipalCreds
} from "../utils/apim";
import { genericInternalErrorHandler } from "../utils/errorHandler";

type IUpdateUserHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  userPayload: UserPayload
) => Promise<IResponseSuccessJson<UserCreated> | IResponseErrorInternal>;

const getUserFromList = (client: GraphRbacManagementClient, email: string) =>
  tryCatch(
    () =>
      client.users.list({
        filter: `signInNames/any(x:x/value eq '${email}')`
      }),
    toError
  ).map(userList => userList[0]);

const updateUser = (
  client: GraphRbacManagementClient,
  userPrincipalName: string,
  adb2cTokenAttributeName: string,
  userPayload: UserPayload
): TaskEither<Error, UserCreated> =>
  tryCatch(
    () =>
      client.users.update(
        userPrincipalName,
        withoutUndefinedValues({
          displayName: `${userPayload.first_name} ${userPayload.last_name}`,
          givenName: userPayload.first_name,
          mailNickname: userPayload.email.split("@")[0],
          surname: userPayload.last_name,
          [adb2cTokenAttributeName]: userPayload.token_name
        })
      ),
    toError
  ).map(
    updateUserResponse =>
      ({
        ...userPayload,
        id: updateUserResponse.objectId
      } as UserCreated)
  );

export function UpdateUserHandler(
  adb2cCredentials: IServicePrincipalCreds,
  adb2cTokenAttributeName: NonEmptyString
): IUpdateUserHandler {
  return async (context, _, userPayload) => {
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "UpdateUser | " + errorMessage,
        error,
        errorMessage
      );
    return getGraphRbacManagementClient(adb2cCredentials)
      .mapLeft(error =>
        internalErrorHandler("Could not get the ADB2C client", error)
      )
      .chain(graphRbacManagementClient =>
        getUserFromList(graphRbacManagementClient, userPayload.email)
          .chain(user =>
            updateUser(
              graphRbacManagementClient,
              user.userPrincipalName,
              adb2cTokenAttributeName,
              userPayload
            )
          )
          .mapLeft(error =>
            internalErrorHandler(
              "Could not update the user on the ADB2C",
              error
            )
          )
      )
      .fold<IResponseSuccessJson<UserCreated> | IResponseErrorInternal>(
        identity,
        updatedUser => ResponseSuccessJson(updatedUser)
      )
      .run();
  };
}

/**
 * Wraps an UpdateUser handler inside an Express request handler.
 */
export function UpdateUser(
  adb2cCreds: IServicePrincipalCreds,
  adb2cTokenAttributeName: NonEmptyString
): express.RequestHandler {
  const handler = UpdateUserHandler(adb2cCreds, adb2cTokenAttributeName);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(UserPayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
