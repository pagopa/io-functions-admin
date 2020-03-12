import { Context } from "@azure/functions";
import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import * as express from "express";
import { toError } from "fp-ts/lib/Either";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
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
import { withRequestMiddlewares } from "io-functions-commons/dist/src/utils/request_middleware";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";
import { wrapRequestHandler } from "italia-ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import * as randomString from "randomstring";
import { ulid } from "ulid";
import { User } from "../generated/definitions/User";
import { UserPayload } from "../generated/definitions/UserPayload";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { userContractToApiUser } from "../utils/conversions";
import { genericInternalErrorHandler } from "../utils/errorHandler";

type ICreateUserHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  userPayload: UserPayload
) => Promise<IResponseSuccessJson<User> | IResponseErrorInternal>;

function getGraphRbacManagementClient(
  adb2cCreds: IServicePrincipalCreds
): TaskEither<Error, GraphRbacManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        adb2cCreds.clientId,
        adb2cCreds.secret,
        adb2cCreds.tenantId,
        { tokenAudience: "graph" }
      ),
    toError
  ).map(
    credentials =>
      new GraphRbacManagementClient(credentials, adb2cCreds.tenantId)
  );
}

export function CreateUserHandler(
  adb2cCredentials: IServicePrincipalCreds,
  apimCredentials: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): ICreateUserHandler {
  return async (context, _, __, ___, userPayload) => {
    const internalErrorHandler = (errorMessage: string, error: Error) =>
      genericInternalErrorHandler(
        context,
        "CreateUser | " + errorMessage,
        error,
        errorMessage
      );
    const response = await getGraphRbacManagementClient(adb2cCredentials)
      .mapLeft(error =>
        internalErrorHandler("Could not get the ADB2C client", error)
      )
      .chain(graphRbacManagementClient =>
        tryCatch(
          () =>
            graphRbacManagementClient.users.create({
              accountEnabled: true,
              creationType: "LocalAccount",
              displayName: `${userPayload.first_name} ${userPayload.last_name}`,
              givenName: userPayload.first_name,
              mailNickname: userPayload.email.split("@")[0],
              passwordProfile: {
                forceChangePasswordNextLogin: true,
                password: randomString.generate({ length: 32 })
              },
              signInNames: [
                {
                  type: "emailAddress",
                  value: userPayload.email
                }
              ],
              surname: userPayload.last_name,
              userPrincipalName: `${ulid()}@${adb2cCredentials.tenantId}`,
              userType: "Member"
            }),
          toError
        ).mapLeft(error =>
          internalErrorHandler("Could not create the user on the ADB2C", error)
        )
      )
      .chain(userCreateResponse =>
        getApiClient(apimCredentials, azureApimConfig.subscriptionId)
          .mapLeft(error =>
            internalErrorHandler(
              "Could not get the API management client",
              error
            )
          )
          .map(apimClient => ({
            apimClient,
            userId: userCreateResponse.objectId
          }))
      )
      .chain(taskResults =>
        tryCatch(
          () =>
            taskResults.apimClient.user.createOrUpdate(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              taskResults.userId,
              {
                email: userPayload.email,
                firstName: userPayload.first_name,
                lastName: userPayload.last_name
              }
            ),
          toError
        ).mapLeft(error =>
          internalErrorHandler(
            "Could not create the user on the API management",
            error
          )
        )
      )
      .chain(userContract =>
        fromEither(userContractToApiUser(userContract))
          .mapLeft(error => internalErrorHandler("Validation error", error))
          .map(ResponseSuccessJson)
      )
      .run();
    return response.value;
  };
}

/**
 * Wraps a CreateUser handler inside an Express request handler.
 */
export function CreateUser(
  serviceModel: ServiceModel,
  adb2cCreds: IServicePrincipalCreds,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = CreateUserHandler(
    adb2cCreds,
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extract the body payload from the request
    RequiredBodyPayloadMiddleware(UserPayload)
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
