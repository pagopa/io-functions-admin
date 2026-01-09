import { Context } from "@azure/functions";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
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
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import express from "express";
import * as E from "fp-ts/lib/Either";
import { identity, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as ROA from "fp-ts/lib/ReadonlyArray";
import * as RMAP from "fp-ts/lib/ReadonlyMap";
import { Ord } from "fp-ts/lib/string";
import * as TE from "fp-ts/lib/TaskEither";

import { ServiceIdWithVersion } from "../generated/definitions/ServiceIdWithVersion";

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IGetServicesHandlerResult>;

type IGetServicesHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<{
      readonly items: readonly ServiceIdWithVersion[];
      readonly page_size: number;
    }>;

export function GetServices(
  serviceModel: ServiceModel
): express.RequestHandler {
  const handler = GetServicesHandler(serviceModel);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceList group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceList]))
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}

/**
 * Wraps a GetServices handler inside an Express request handler.
 */

export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  return async (_, __) => {
    const allRetrievedServicesIterator = serviceModel
      .getCollectionIterator()
      [Symbol.asyncIterator]();

    return pipe(
      TE.tryCatch(
        () =>
          asyncIteratorToArray(
            flattenAsyncIterator(allRetrievedServicesIterator)
          ),
        toCosmosErrorResponse
      ),
      TE.mapLeft(error => ResponseErrorQuery("Cannot get services", error)),
      TE.map(results =>
        pipe(
          results,
          ROA.filter(E.isRight),
          ROA.map(e => e.right),
          // create a Map (serviceId, lastVersionNumber)
          items =>
            ROA.reduce(
              new Map<
                (typeof items)[0]["serviceId"],
                (typeof items)[0]["version"]
              >(),
              (prev, curr: (typeof items)[0]) =>
                // keep only the latest version
                pipe(
                  prev.has(curr.serviceId),
                  O.fromPredicate(identity),
                  O.chainNullableK(() => prev.get(curr.serviceId)),
                  O.fold(
                    () => true,
                    prevVersion => curr.version > prevVersion
                  ),
                  isNewer =>
                    isNewer ? prev.set(curr.serviceId, curr.version) : prev
                )
            )(items),
          // format into an array of { id, version }
          RMAP.collect(Ord)((serviceId, version) => ({
            id: serviceId,
            version
          })),
          items =>
            ResponseSuccessJson({
              items,
              page_size: items.length
            })
        )
      ),
      TE.toUnion
    )();
  };
}
