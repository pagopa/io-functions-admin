import { Context } from "@azure/functions";

import * as express from "express";

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

import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as RMAP from "fp-ts/lib/ReadonlyMap";
import * as RA from "fp-ts/lib/ReadonlyArray";
import {
  asyncIteratorToArray,
  flattenAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { Ord } from "fp-ts/lib/string";
import { ServiceIdWithVersion } from "../generated/definitions/ServiceIdWithVersion";

type IGetServicesHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<{
      readonly items: ReadonlyArray<ServiceIdWithVersion>;
      readonly page_size: number;
    }>;

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IGetServicesHandlerResult>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
          RA.filter(E.isRight),
          RA.map(e => e.right),
          // create a Map (serviceId, lastVersionNumber)
          items =>
            RA.reduce(
              new Map<
                typeof items[0]["serviceId"],
                typeof items[0]["version"]
              >(),
              (prev, curr: typeof items[0]) => {
                // keep only the latest version
                const isNewer =
                  !prev.has(curr.serviceId) ||
                  curr.version > prev.get(curr.serviceId);
                return isNewer ? prev.set(curr.serviceId, curr.version) : prev;
              }
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

/**
 * Wraps a GetServices handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
