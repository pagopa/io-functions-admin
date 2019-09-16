import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import { isLeft } from "fp-ts/lib/Either";

import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import { CustomTelemetryClientFactory } from "io-functions-commons/dist/src/utils/application_insights";
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
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";
import {
  checkSourceIpForHandler,
  clientIPAndCidrTuple as ipTuple
} from "io-functions-commons/dist/src/utils/source_ip_check";

import {
  apiServiceToService,
  retrievedServiceToApiService
} from "../utils/conversions";
import { ServicePayloadMiddleware } from "../utils/middlewares/service";
import { UpsertServiceEvent } from "../utils/UpsertServiceEvent";

type ICreateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  servicePayload: ApiService
) => Promise<IResponseSuccessJson<ApiService> | IResponseErrorQuery>;

export function CreateServiceHandler(
  _GCTC: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): ICreateServiceHandler {
  return async (context, __, ___, ____, servicePayload) => {
    const service = apiServiceToService(servicePayload);
    const errorOrCreatedService = await serviceModel.create(
      service,
      service.serviceId
    );

    if (isLeft(errorOrCreatedService)) {
      return ResponseErrorQuery(
        "CreateServiceHandler error",
        errorOrCreatedService.value
      );
    }

    const createdService = errorOrCreatedService.value;

    // Start orchestrator
    const event: UpsertServiceEvent = {
      newService: createdService,
      updatedAt: new Date().getTime()
    };
    const dfClient = df.getClient(context);
    await dfClient.startNew("UpsertServiceOrchestrator", undefined, event);

    return ResponseSuccessJson(retrievedServiceToApiService(createdService));
  };
}

/**
 * Wraps a CreateService handler inside an Express request handler.
 */
export function CreateService(
  getCustomTelemetryClient: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = CreateServiceHandler(getCustomTelemetryClient, serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the Service payload from the request body
    ServicePayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
