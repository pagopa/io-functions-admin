import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";

import { Service as ApiService } from "@pagopa/io-functions-commons/dist/generated/definitions/Service";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";

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
  serviceId: ServiceId,
  servicePayload: ApiService
) => Promise<
  | IResponseSuccessJson<ApiService>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateServiceHandler(
  serviceModel: ServiceModel
): IUpdateServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, serviceId, servicePayload) => {
    if (servicePayload.service_id !== serviceId) {
      return ResponseErrorValidation(
        "Error validating payload",
        "Value of `service_id` in the request body must match " +
          "the value of `service_id` path parameter"
      );
    }

    const errorOrMaybeRetrievedService = await serviceModel.findOneByServiceId(
      serviceId
    )();
    if (E.isLeft(errorOrMaybeRetrievedService)) {
      return ResponseErrorQuery(
        "Error trying to retrieve existing service",
        errorOrMaybeRetrievedService.left
      );
    }

    const maybeService = errorOrMaybeRetrievedService.right;
    if (O.isNone(maybeService)) {
      return ResponseErrorNotFound(
        "Error",
        "Could not find a service with the provided serviceId"
      );
    }

    const existingService = maybeService.value;

    const errorOrUpdatedService = await serviceModel.update({
      ...existingService,
      ...apiServiceToService(servicePayload)
    })();

    if (E.isLeft(errorOrUpdatedService)) {
      return ResponseErrorQuery(
        "Error while updating the existing service",
        errorOrUpdatedService.left
      );
    }

    const updatedService = errorOrUpdatedService.right;

    const upsertServiceEvent = UpsertServiceEvent.encode({
      newService: updatedService,
      oldService: existingService,
      updatedAt: new Date()
    });

    // Start orchestrator
    const dfClient = df.getClient(context);
    await dfClient.startNew(
      "UpsertServiceOrchestrator",
      undefined,
      upsertServiceEvent
    );

    return ResponseSuccessJson(retrievedServiceToApiService(updatedService));
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UpdateService(
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = UpdateServiceHandler(serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    // Extracts the Service payload from the request body
    ServicePayloadMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
