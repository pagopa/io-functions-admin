import { ApiManagementClient } from "@azure/arm-apimanagement";
import { Context } from "@azure/functions";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import * as express from "express";
import { array } from "fp-ts/lib/Array";
import { either, toError } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
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
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { UserCollection } from "../generated/definitions/UserCollection";
import { userContractToApiUser } from "../utils/conversions";
import { CursorMiddleware } from "../utils/middlewares/cursorMiddleware";

export interface IServicePrincipalCreds {
  readonly clientId: string;
  readonly secret: string;
  readonly tenantId: string;
}

export interface IAzureApimConfig {
  readonly subscriptionId: string;
  readonly apimResourceGroup: string;
  readonly apim: string;
}

function getApiClient(
  servicePrincipalCreds: IServicePrincipalCreds,
  subscriptionId: string
): TaskEither<Error, ApiManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        servicePrincipalCreds.clientId,
        servicePrincipalCreds.secret,
        servicePrincipalCreds.tenantId
      ),
    toError
  ).map(credentials => new ApiManagementClient(credentials, subscriptionId));
}

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  cursor?: number
) => Promise<IResponseSuccessJson<UserCollection> | IResponseErrorInternal>;

export function GetUsersHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  functionsUrl: string
): IGetSubscriptionKeysHandler {
  return async (context, _, __, ___, cursor = 0) => {
    const response = await getApiClient(
      servicePrincipalCreds,
      azureApimConfig.subscriptionId
    )
      .chain(apiClient =>
        tryCatch(
          () =>
            apiClient.user.listByService(
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              {
                skip: cursor
              }
            ),
          toError
        )
      )
      .map(userSubscriptionList => {
        const errorOrUsers = array.traverse(either)(
          userSubscriptionList,
          userContractToApiUser
        );
        return errorOrUsers.fold<
          IResponseErrorInternal | IResponseSuccessJson<UserCollection>
        >(
          error => {
            context.log.error("GetUsers function | ", error);
            return ResponseErrorInternal("Validation error");
          },
          users =>
            ResponseSuccessJson({
              items: users,
              next: userSubscriptionList.nextLink
                ? `${functionsUrl}/adm/users?cursor=${cursor + users.length}`
                : undefined
            })
        );
      })
      .mapLeft(error => {
        context.log.error("GetUsers function | ", error);
        return ResponseErrorInternal("Internal server error");
      })
      .run();
    return response.value;
  };
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */
export function GetUsers(
  serviceModel: ServiceModel,
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  functionsUrl: string
): express.RequestHandler {
  const handler = GetUsersHandler(
    servicePrincipalCreds,
    azureApimConfig,
    functionsUrl
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
    // Extract the skip value from the request
    CursorMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
