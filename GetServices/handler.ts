import { Context } from "@azure/functions";

import * as express from "express";

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

import { rights } from "fp-ts/lib/Array";
import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { Option } from "fp-ts/lib/Option";
import { collect, StrMap } from "fp-ts/lib/StrMap";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "io-functions-commons/dist/src/utils/cosmosdb_model";
import { Errors } from "io-ts";
import {
  IResponseSuccessJson,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { Service as ApiService } from "../generated/definitions/Service";
import { retrievedServiceToApiService } from "../utils/conversions";

type IGetServicesHandlerResult =
  | IResponseErrorQuery
  | IResponseSuccessJson<{ items: readonly ApiService[]; page_size: number }>;

type IGetServicesHandler = (
  context: Context,
  auth: IAzureApiAuthorization
) => Promise<IGetServicesHandlerResult>;

interface IFoldableResultIterator<T> {
  readonly executeNext: (init: T) => Promise<Either<CosmosErrors, T>>;
}

function reduceResultIterator<A, B>(
  i: AsyncIterator<ReadonlyArray<Either<Errors, A>>>,
  f: (prev: B, curr: A) => B
): IFoldableResultIterator<B> {
  return {
    executeNext: (init: B) =>
      new Promise((resolve, reject) =>
        i.next().then(
          errorOrMaybeDocuments =>
            errorOrMaybeDocuments.value().map(arrayOfMaybeDocs => {
              if (rights(arrayOfMaybeDocs).length !== arrayOfMaybeDocs.length) {
                return resolve(
                  left<CosmosErrors, B>(
                    toCosmosErrorResponse(
                      new Error("Some service cannot be decoded correctly")
                    )
                  )
                );
              } else {
                rights(arrayOfMaybeDocs).forEach(
                  (documents: ReadonlyArray<A>) => {
                    if (documents && documents.length > 0) {
                      return resolve(
                        right<CosmosErrors, B>(documents.reduce(f, init))
                      );
                    } else {
                      return resolve(right<CosmosErrors, B>(init));
                    }
                  }
                );
              }
            }),
          reject
        )
      )
  };
}

async function iteratorToValue<T>(
  _: IFoldableResultIterator<T>,
  init: T
): Promise<Either<CosmosErrors, T>> {
  async function iterate(a: T): Promise<Either<CosmosErrors, T>> {
    const errorOrResult = await _.executeNext(a);
    if (isLeft(errorOrResult)) {
      return left<CosmosErrors, T>(errorOrResult.value);
    }
    const result = errorOrResult.value;
    return iterate(result);
  }
  return iterate(init);
}

export function GetServicesHandler(
  serviceModel: ServiceModel
): IGetServicesHandler {
  return async (_, __) => {
    const allRetrievedServicesIterator = serviceModel
      .getCollectionIterator()
      [Symbol.asyncIterator]();
    const allServicesIterator: IFoldableResultIterator<
      Record<string, ApiService>
    > = reduceResultIterator(allRetrievedServicesIterator, (prev, curr) => {
      // keep only the latest version
      const isNewer =
        !prev[curr.serviceId] || curr.version > prev[curr.serviceId].version;
      return {
        ...prev,
        ...(isNewer
          ? { [curr.serviceId]: retrievedServiceToApiService(curr) }
          : {})
      };
    });
    return (await iteratorToValue(allServicesIterator, {})).fold<
      IGetServicesHandlerResult
    >(
      error =>
        ResponseErrorQuery("Cannot get services", toCosmosErrorResponse(error)),
      services => {
        const items = collect(new StrMap(services), (_____, v) => v);
        return ResponseSuccessJson({
          items,
          page_size: items.length
        });
      }
    );
  };
}

/**
 * Wraps a GetServices handler inside an Express request handler.
 */
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
