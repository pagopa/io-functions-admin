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
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import { ServiceId } from "../generated/definitions/ServiceId";
import { ImpersonatedService } from "../generated/definitions/ImpersonatedService";
import { getSubscription, getUser, mapApimRestError } from "../utils/apim";
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

const chainNullableWithNotFound = (
  value: string | undefined
): TE.TaskEither<IResponseErrorNotFound, string> =>
  pipe(
    value,
    O.fromNullable,
    TE.fromOption(() => ResponseErrorNotFound("Not found", "Not Found"))
  );

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetImpersonateServiceHandler(
  servicePrincipalCreds: IServicePrincipalCreds,
  azureApimConfig: IAzureApimConfig
): IGetImpersonateService {
  const apimClient = getApiClient(
    servicePrincipalCreds,
    azureApimConfig.subscriptionId
  );
  return async (_context, _, serviceId): ReturnType<IGetImpersonateService> =>
    pipe(
      getSubscription(
        apimClient,
        azureApimConfig.apimResourceGroup,
        azureApimConfig.apim,
        serviceId
      ),
      TE.mapLeft(mapApimRestError("Subscription")),
      TE.map(subscription => subscription.ownerId),
      TE.chainW(chainNullableWithNotFound),
      TE.map(ownerId => ownerId.substring(ownerId.lastIndexOf("/"))),
      TE.chain(userId =>
        pipe(
          getUserGroups(
            apimClient,
            azureApimConfig.apimResourceGroup,
            azureApimConfig.apim,
            userId
          ),
          TE.mapLeft(e =>
            ResponseErrorInternal(
              `Error while retrieving user groups ${e.statusCode}`
            )
          ),
          TE.map(groups => groups.map(g => g.displayName).join(",")),
          TE.map(groupsAsString => ({
            service_id: serviceId,
            user_groups: groupsAsString
          })),
          TE.chain(result =>
            pipe(
              getUser(
                apimClient,
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                userId
              ),
              TE.mapLeft(mapApimRestError("User")),
              TE.map(user => user.email),
              TE.chainW(chainNullableWithNotFound),
              TE.map(user_email => ({ ...result, user_email }))
            )
          )
        )
      ),
      TE.map(ResponseSuccessJson),
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
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the serviceId value from the request
    RequiredParamMiddleware("serviceId", ServiceId)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
