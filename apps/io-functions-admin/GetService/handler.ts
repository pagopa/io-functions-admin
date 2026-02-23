import { InvocationContext } from "@azure/functions";
import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import {
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { retrievedServiceToApiService } from "../utils/conversions";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IGetServiceHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId
) => Promise<
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseSuccessJson<ApiService>
>;

export function GetService(serviceModel: ServiceModel) {
  const handler = GetServiceHandler(serviceModel);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceRead])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a GetService handler inside an Express request handler.
 */

export function GetServiceHandler(
  serviceModel: ServiceModel
): IGetServiceHandler {
  return async (_, __, serviceId) =>
    pipe(
      serviceModel.findOneByServiceId(serviceId),
      TE.mapLeft(e =>
        ResponseErrorQuery("Error while retrieving the service", e)
      ),
      TE.chainW(
        TE.fromOption(() =>
          ResponseErrorNotFound(
            "Service not found",
            "The service you requested was not found in the system."
          )
        )
      ),
      TE.map(retrievedServiceToApiService),
      TE.map(ResponseSuccessJson),
      TE.toUnion
    )();
}
