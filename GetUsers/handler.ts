import { Context } from "@azure/functions";
import * as express from "express";
import { array } from "fp-ts/lib/Array";
import { either, toError } from "fp-ts/lib/Either";
import { tryCatch } from "fp-ts/lib/TaskEither";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { withRequestMiddlewares } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import { UserCollection } from "../generated/definitions/UserCollection";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { userContractToApiUser } from "../utils/conversions";
import { CursorMiddleware } from "../utils/middlewares/cursorMiddleware";

type IGetSubscriptionKeysHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  cursor?: number
) => Promise<IResponseSuccessJson<UserCollection> | IResponseErrorInternal>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetUsersHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  azureApimHost: string
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, cursor = 0) => {
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
            context.log.error("GetUsers | ", error);
            return ResponseErrorInternal("Validation error");
          },
          users =>
            ResponseSuccessJson({
              items: users,
              next: userSubscriptionList.nextLink
                ? `https://${azureApimHost}/adm/users?cursor=${cursor +
                    users.length}`
                : undefined
            })
        );
      })
      .mapLeft(error => {
        context.log.error("GetUsers | ", error);
        return ResponseErrorInternal("Internal server error");
      })
      .run();
    return response.value;
  };
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetUsers(
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
    // Extract the skip value from the request
    CursorMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
