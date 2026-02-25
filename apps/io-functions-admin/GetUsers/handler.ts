import { InvocationContext } from "@azure/functions";
import { asyncIteratorToPageArray } from "@pagopa/io-functions-commons/dist/src/utils/async";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as TE from "fp-ts/lib/TaskEither";

import { UserCollection } from "../generated/definitions/UserCollection";
import { getApiClient, IAzureApimConfig } from "../utils/apim";
import { userContractToApiUser } from "../utils/conversions";
import { CursorMiddleware } from "../utils/middlewares/cursorMiddleware";

type IGetSubscriptionKeysHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  cursor?: number
) => Promise<IResponseErrorInternal | IResponseSuccessJson<UserCollection>>;

export function GetUsers(
  azureApimConfig: IAzureApimConfig,
  functionsUrl: string,
  pageSize: NonNegativeInteger
) {
  const handler = GetUsersHandler(azureApimConfig, functionsUrl, pageSize);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the skip value from the request
    CursorMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a GetUsers handler inside an Express request handler.
 */

export function GetUsersHandler(
  azureApimConfig: IAzureApimConfig,
  azureApimHost: string,
  pageSize: NonNegativeInteger
): IGetSubscriptionKeysHandler {
  return async (context, _, cursor = 0) =>
    pipe(
      getApiClient(azureApimConfig.subscriptionId),
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
            context.error("GetUsers | ", error);
            return ResponseErrorInternal("Validation error");
          }),
          E.map(users =>
            ResponseSuccessJson({
              items: users,
              next:
                userSubscriptionList.results.length === pageSize
                  ? `https://${azureApimHost}/adm/users?cursor=${
                      cursor + users.length
                    }`
                  : undefined
            })
          ),
          TE.fromEither
        )
      ),
      TE.mapLeft(error => {
        context.error("GetUsers | ", error);
        return ResponseErrorInternal("Internal server error");
      }),
      TE.toUnion
    )();
}
