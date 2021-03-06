import { Context } from "@azure/functions";

import * as express from "express";

import * as df from "durable-functions";

import { isLeft } from "fp-ts/lib/Either";

import {
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";

import { Service as ApiService } from "io-functions-commons/dist/generated/definitions/Service";
import { ServiceModel } from "io-functions-commons/dist/src/models/service";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
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
  apiServiceToService,
  retrievedServiceToApiService
} from "../utils/conversions";
import { ServicePayloadMiddleware } from "../utils/middlewares/service";
import { UpsertServiceEvent } from "../utils/UpsertServiceEvent";

type ICreateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  servicePayload: ApiService
) => Promise<
  | IResponseSuccessJson<ApiService>
  | IResponseErrorQuery
  | IResponseErrorValidation
>;

export function CreateServiceHandler(
  serviceModel: ServiceModel
): ICreateServiceHandler {
  return async (context, _, servicePayload) => {
    const newService = {
      ...apiServiceToService(servicePayload),
      kind: "INewService" as const
    };
    const errorOrCreatedService = await serviceModel.create(newService).run();

    if (isLeft(errorOrCreatedService)) {
      return ResponseErrorQuery(
        "CreateServiceHandler error",
        errorOrCreatedService.value
      );
    }

    const createdService = errorOrCreatedService.value;

    const upsertServiceEvent = UpsertServiceEvent.encode({
      newService: createdService,
      updatedAt: new Date()
    });

    // Start orchestrator
    const dfClient = df.getClient(context);
    await dfClient.startNew(
      "UpsertServiceOrchestrator",
      undefined,
      upsertServiceEvent
    );

    return ResponseSuccessJson(retrievedServiceToApiService(createdService));
  };
}

/**
 * Wraps a CreateService handler inside an Express request handler.
 */
export function CreateService(
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = CreateServiceHandler(serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the Service payload from the request body
    ServicePayloadMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
