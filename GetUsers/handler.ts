import { Context } from "@azure/functions";
import * as express from "express";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
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

import { pipe } from "fp-ts/lib/function";
import { UserCollection } from "../generated/definitions/UserCollection";
import {
  getApiClient,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";
import { userContractToApiUser } from "../utils/conversions";
import { CursorMiddleware } from "../utils/middlewares/cursorMiddleware";
import { UserContract } from "@azure/arm-apimanagement";

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
  const apimClient = getApiClient(
    servicePrincipalCreds,
    azureApimConfig.subscriptionId
  );
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, cursor = 0) =>
    pipe(
      apimClient.user.listByService(
        azureApimConfig.apimResourceGroup,
        azureApimConfig.apim,
        {
          skip: cursor
        }
      ),
      productListResponse =>
        TE.tryCatch(
          async () => {
            // eslint-disable-next-line functional/no-let, prefer-const, functional/prefer-readonly-type
            let items: UserContract[] = [];
            for await (const x of productListResponse) {
              // eslint-disable-next-line functional/immutable-data
              items.push(x);
            }
            return items;
          },
          () => ResponseErrorInternal("Could not list the user by email.")
        ),
      TE.chainW(userSubscriptionList =>
        pipe(
          userSubscriptionList,
          A.traverse(E.Applicative)(userContractToApiUser),
          E.mapLeft(error => {
            context.log.error("GetUsers | ", error);
            return ResponseErrorInternal("Validation error");
          }),
          E.map(users =>
            // TODO: Da Capire se va bene, prima era presente un nextLink che se era valorizzato
            // indicava che erano presenti altri utenti
            // se presente appunto veniva valorizzato next con il link per la successiva chiamata
            // ora é cambiato proprio il funzionamento del metodo dell'SDK, temo che li faccia fetchare tutti oneshot
            // dato che si tratta di un PagedAsyncIterableIterator
            // In tal caso forse dobbiamo aggiungere un parametro in piú all'api, top per limitare il fetch
            ResponseSuccessJson({
              items: users,
              next:
                userSubscriptionList.length !== 0
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
