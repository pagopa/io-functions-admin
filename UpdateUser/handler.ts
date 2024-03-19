import { Context } from "@azure/functions";
import { GraphRbacManagementClient } from "@azure/graph";
import { User } from "@azure/graph/esm/models";
import * as express from "express";
import { toError } from "fp-ts/lib/Either";
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
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";
import { EmailAddress } from "../generated/definitions/EmailAddress";
import { UserUpdated } from "../generated/definitions/UserUpdated";
import { UserUpdatePayload } from "../generated/definitions/UserUpdatePayload";
import {
  getGraphRbacManagementClient,
  IServicePrincipalCreds
} from "../utils/apim";
import { genericInternalErrorHandler } from "../utils/errorHandler";

type IUpdateUserHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  email: EmailAddress,
  userPayload: UserUpdatePayload
) => Promise<IResponseSuccessJson<UserUpdated> | IResponseErrorInternal>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const getUserFromList = (client: GraphRbacManagementClient, email: string) =>
  pipe(
    TE.tryCatch(
      () =>
        client.users.list({
          filter: `signInNames/any(x:x/value eq '${email}')`
        }),
      toError
    ),
    TE.map(userList => userList[0])
  );

const updateUser = (
  client: GraphRbacManagementClient,
  email: EmailAddress,
  user: User,
  adb2cTokenAttributeName: string,
  userPayload: UserUpdatePayload
): TE.TaskEither<Error, UserUpdated> =>
  pipe(
    TE.tryCatch(
      () =>
        client.users.update(
          // TODO: Implement a validation step to ensure the existence of `userPrincipalName`
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          user.userPrincipalName,
          withoutUndefinedValues({
            displayName:
              userPayload.first_name && userPayload.last_name
                ? `${userPayload.first_name} ${userPayload.last_name}`
                : undefined,
            givenName: userPayload.first_name,
            surname: userPayload.last_name,
            // eslint-disable-next-line sort-keys
            [adb2cTokenAttributeName]: userPayload.token_name
          })
        ),
      toError
    ),
    TE.chain(() =>
      pipe(
        getUserFromList(client, email),
        TE.chain(userResponse =>
          pipe(
            {
              email,
              first_name: userPayload.first_name,
              id: userResponse.objectId,
              last_name: userPayload.last_name,
              token_name: userPayload.token_name
            },
            UserUpdated.decode,
            E.mapLeft(
              errs =>
                new Error(
                  `Error decoding UserUpdated ERROR=${readableReport(errs)}`
                )
            ),
            TE.fromEither
          )
        )
      )
    )
  );

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateUserHandler(
  adb2cCredentials: IServicePrincipalCreds,
  adb2cTokenAttributeName: NonEmptyString
): IUpdateUserHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, email, userPayload) => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "UpdateUser| " + errorMessage,
        error,
        errorMessage
      );
    return pipe(
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
  };
}

/**
 * Wraps an UpdateUser handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
    // Extract the email value from the request
    RequiredParamMiddleware("email", EmailAddress),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(UserUpdatePayload)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
