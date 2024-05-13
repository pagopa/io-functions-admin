import { Context } from "@azure/functions";
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
import * as express from "express";
import * as E from "fp-ts/lib/Either";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as TE from "fp-ts/lib/TaskEither";

import { asyncIteratorToPageArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { pipe } from "fp-ts/lib/function";
import { UserCollection } from "../generated/definitions/UserCollection";
import {
  IAzureApimConfig,
  IServicePrincipalCreds,
  getApiClient
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
  azureApimHost: string,
  pageSize: NonNegativeInteger
): IGetSubscriptionKeysHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, cursor = 0) =>
    pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.chain(apiClient =>
        TE.tryCatch(
          () =>
            asyncIteratorToPageArray(
              apiClient.user.listByService(
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                {
                  skip: cursor
                }
              ),
              pageSize
            ),
          E.toError
        )
      ),
      TE.chainW(userSubscriptionList =>
        pipe(
          userSubscriptionList.results,
          RA.map(userContractToApiUser),
          RA.sequence(E.Applicative),
          E.mapLeft(error => {
            context.log.error("GetUsers | ", error);
            return ResponseErrorInternal("Validation error");
          }),
          E.map(users =>
            ResponseSuccessJson({
              items: users,
              next:
                userSubscriptionList.results.length === pageSize
                  ? `https://${azureApimHost}/adm/users?cursor=${cursor +
                      users.length}`
                  : undefined
            })
          ),
          TE.fromEither
        )
      ),
      TE.mapLeft(error => {
        context.log.error("GetUsers | ", error);
        return ResponseErrorInternal("Internal server error");
      }),
      TE.toUnion
    )();
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetUsers(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig,
  functionsUrl: string,
  pageSize: NonNegativeInteger
): express.RequestHandler {
  const handler = GetUsersHandler(
    servicePrincipalCreds,
    azureApimConfig,
    functionsUrl,
    pageSize
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
