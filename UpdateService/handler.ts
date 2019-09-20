import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";

import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
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
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";
import { UpsertServiceEvent } from "../utils/UpsertServiceEvent";

type IUpdateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  clientIp: ClientIp,
  userAttributes: IAzureUserAttributes,
  serviceId: ServiceId,
  servicePayload: ApiService
) => Promise<
  // tslint:disable-next-line: max-union-size
  | IResponseSuccessJson<ApiService>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

export function UpdateServiceHandler(
  _GCTC: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): IUpdateServiceHandler {
  return async (context, __, ___, ____, serviceId, servicePayload) => {
    if (servicePayload.service_id !== serviceId) {
      return ResponseErrorValidation(
        "Error validating payload",
        "Value of `service_id` in the request body must match " +
          "the value of `service_id` path parameter"
      );
    }

    const errorOrMaybeRetrievedService = await serviceModel.findOneByServiceId(
      serviceId
    );
    if (isLeft(errorOrMaybeRetrievedService)) {
      return ResponseErrorQuery(
        "Error trying to retrieve existing service",
        errorOrMaybeRetrievedService.value
      );
    }

    const maybeService = errorOrMaybeRetrievedService.value;
    if (isNone(maybeService)) {
      return ResponseErrorNotFound(
        "Error",
        "Could not find a service with the provided serviceId"
      );
    }

    const existingService = maybeService.value;

    const errorOrMaybeUpdatedService = await serviceModel.update(
      existingService.id,
      existingService.serviceId,
      currentService => {
        return {
          ...currentService,
          ...apiServiceToService(servicePayload),
          serviceId
        };
      }
    );

    if (isLeft(errorOrMaybeUpdatedService)) {
      return ResponseErrorQuery(
        "Error while updating the existing service",
        errorOrMaybeUpdatedService.value
      );
    }

    const maybeUpdatedService = errorOrMaybeUpdatedService.value;
    if (isNone(maybeUpdatedService)) {
      return ResponseErrorInternal("Error while updating the existing service");
    }

    const updatedService = maybeUpdatedService.value;

    const errorOrUpsertServiceEvent = UpsertServiceEvent.decode({
      newService: updatedService,
      oldService: existingService,
      updatedAt: new Date().getTime()
    });

    if (isLeft(errorOrUpsertServiceEvent)) {
      return ResponseErrorValidation(
        "Unable to decode UpsertServiceEvent",
        readableReport(errorOrUpsertServiceEvent.value)
      );
    }

    // Start orchestrator
    const dfClient = df.getClient(context);
    await dfClient.startNew(
      "UpsertServiceOrchestrator",
      undefined,
      errorOrUpsertServiceEvent.value
    );

    return ResponseSuccessJson(retrievedServiceToApiService(updatedService));
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */
export function UpdateService(
  getCustomTelemetryClient: CustomTelemetryClientFactory,
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = UpdateServiceHandler(getCustomTelemetryClient, serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the client IP from the request
    ClientIpMiddleware,
    // Extracts custom user attributes from the request
    AzureUserAttributesMiddleware(serviceModel),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    // Extracts the Service payload from the request body
    ServicePayloadMiddleware
  );

  return wrapRequestHandler(
    middlewaresWrap(
      checkSourceIpForHandler(handler, (_, __, c, u, ___) => ipTuple(c, u))
    )
  );
}
