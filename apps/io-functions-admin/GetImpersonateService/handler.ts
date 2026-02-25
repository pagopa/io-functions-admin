import { InvocationContext } from "@azure/functions";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";

import { ImpersonatedService } from "../generated/definitions/ImpersonatedService";
import { ServiceId } from "../generated/definitions/ServiceId";
import { getSubscription, getUser, mapApimRestError } from "../utils/apim";
import { getApiClient, getUserGroups, IAzureApimConfig } from "../utils/apim";

type IGetImpersonateService = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseSuccessJson<ImpersonatedService>
>;

const chainNullableWithNotFound = (
  value: string | undefined
): TE.TaskEither<IResponseErrorNotFound, string> =>
  pipe(
    value,
    O.fromNullable,
    TE.fromOption(() => ResponseErrorNotFound("Not found", "Not Found"))
  );

export function GetImpersonateService(azureApimConfig: IAzureApimConfig) {
  const handler = GetImpersonateServiceHandler(azureApimConfig);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiUserAdmin group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiUserAdmin])),
    // Extract the serviceId value from the request
    RequiredParamMiddleware("serviceId", ServiceId)
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a GetServices handler inside an Express request handler.
 */

export function GetImpersonateServiceHandler(
  azureApimConfig: IAzureApimConfig
): IGetImpersonateService {
  return async (_context, _, serviceId): ReturnType<IGetImpersonateService> =>
    pipe(
      getApiClient(azureApimConfig.subscriptionId),
      TE.mapLeft(e =>
        ResponseErrorInternal(`Error while connecting to APIM ${e.message}`)
      ),
      TE.chain(apimC =>
        pipe(
          getSubscription(
            apimC,
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
                apimC,
                azureApimConfig.apimResourceGroup,
                azureApimConfig.apim,
                userId
              ),
              TE.mapLeft(e =>
                ResponseErrorInternal(
                  `Error while retrieving user groups ${e.message}`
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
                    apimC,
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
          )
        )
      ),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
}
