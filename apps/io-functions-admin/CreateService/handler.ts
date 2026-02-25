import { InvocationContext } from "@azure/functions";
import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
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
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { isLeft } from "fp-ts/lib/Either";

import {
  apiServiceToService,
  retrievedServiceToApiService
} from "../utils/conversions";
import { ServicePayloadMiddleware } from "../utils/middlewares/service";

type ICreateServiceHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  servicePayload: ApiService
) => Promise<
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseSuccessJson<ApiService>
>;

export function CreateService(serviceModel: ServiceModel) {
  const handler = CreateServiceHandler(serviceModel);

  const middlewares = [
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the Service payload from the request body
    ServicePayloadMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

/**
 * Wraps a CreateService handler inside an Express request handler.
 */

export function CreateServiceHandler(
  serviceModel: ServiceModel
): ICreateServiceHandler {
  return async (_context, _, servicePayload) => {
    const newService = {
      ...apiServiceToService(servicePayload),
      kind: "INewService" as const
    };
    const errorOrCreatedService = await serviceModel.create(newService)();

    if (isLeft(errorOrCreatedService)) {
      return ResponseErrorQuery(
        "CreateServiceHandler error",
        errorOrCreatedService.left
      );
    }

    return ResponseSuccessJson(
      retrievedServiceToApiService(errorOrCreatedService.right)
    );
  };
}
