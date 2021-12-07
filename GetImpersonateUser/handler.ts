import { Context } from "@azure/functions";
import * as express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { withRequestMiddlewares } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { wrapRequestHandler } from "@pagopa/ts-commons/lib/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import { ServiceId } from "../generated/definitions/ServiceId";
import { ImpersonatedService } from "../generated/definitions/ImpersonatedService";
import {
  getSubscription,
  extractUserId,
  wrapWithIResponse
} from "../utils/apim";
import {
  getApiClient,
  getUserGroups,
  IAzureApimConfig,
  IServicePrincipalCreds
} from "../utils/apim";

type IGetImpersonateService = (
  context: Context,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseSuccessJson<ImpersonatedService>
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetImpersonateServiceHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetImpersonateService {
  return async (_context, _, serviceId): ReturnType<IGetImpersonateService> =>
    pipe(
      getApiClient(servicePrincipalCreds, azureApimConfig.subscriptionId),
      TE.chain(apimC =>
        pipe(
          getSubscription(
            apimC,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            serviceId
          ),
          TE.map(extractUserId),
          TE.filterOrElseW(
            O.isSome,
            () => new Error("Missing owner for input service")
          ),
          TE.chain(userId =>
            getUserGroups(
              apimC,
              azureApimConfig.apimResourceGroup,
              azureApimConfig.apim,
              userId.value
            )
          )
        )
      ),
      TE.map(groups => groups.map(g => g.displayName).join(",")),
      TE.map(groupsAsString => ({
        service_id: serviceId,
        user_groups: groupsAsString
      })),
      TE.map(ResponseSuccessJson),
      wrapWithIResponse,
      TE.toUnion
    )();
}

/**
 * Wraps a GetServices handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetImpersonateService(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): express.RequestHandler {
  const handler = GetImpersonateServiceHandler(
    servicePrincipalCreds,
    azureApimConfig
  );

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])), // FIXME: APiUserAdmin is too much???
    // Extract the serviceId value from the request
    RequiredParamMiddleware("serviceId", ServiceId)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}