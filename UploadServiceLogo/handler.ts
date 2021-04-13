import { Context } from "@azure/functions";

import * as express from "express";

import { isLeft, left, right } from "fp-ts/lib/Either";
import { fromNullable, isNone } from "fp-ts/lib/Option";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "italia-ts-commons/lib/responses";

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

import { BlobService } from "azure-storage";
import { identity } from "fp-ts/lib/function";
import { Option, tryCatch } from "fp-ts/lib/Option";
import {
  fromLeft,
  fromPredicate as fromPredicateT,
  taskEither,
  TaskEither,
  taskify
} from "fp-ts/lib/TaskEither";
import { fromEither } from "fp-ts/lib/TaskEither";
import * as UPNG from "upng-js";
import { Logo as ApiLogo } from "../generated/definitions/Logo";
import { ServiceId } from "../generated/definitions/ServiceId";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IUpdateServiceHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId,
  logoPayload: ApiLogo
) => Promise<
  // eslint-disable-next-line @typescript-eslint/ban-types
  | IResponseSuccessRedirectToResource<{}, {}>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorNotFound
  | IResponseErrorInternal
>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const imageValidationErrorResponse = () =>
  ResponseErrorValidation(
    "Image not valid",
    "The base64 representation of the logo is invalid"
  );

const upsertBlobFromImageBuffer = (
  blobService: BlobService,
  containerName: string,
  blobName: string,
  content: Buffer
): TaskEither<Error, Option<BlobService.BlobResult>> =>
  taskify<Error, BlobService.BlobResult>(cb =>
    blobService.createBlockBlobFromText(containerName, blobName, content, cb)
  )().map(fromNullable);

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function UpdateServiceLogoHandler(
  serviceModel: ServiceModel,
  blobService: BlobService,
  logosUrl: string
): IUpdateServiceHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_, __, serviceId, logoPayload) => {
    const errorOrMaybeRetrievedService = await serviceModel
      .findOneByServiceId(serviceId)
      .run();
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

    const bufferImage = Buffer.from(logoPayload.logo, "base64");
    const lowerCaseServiceId = serviceId.toLowerCase();
    return fromEither(
      tryCatch(() => UPNG.decode(bufferImage)).foldL(
        () =>
          left<IResponseErrorValidation, UPNG.Image>(
            imageValidationErrorResponse()
          ),
        img => right<IResponseErrorValidation, UPNG.Image>(img)
      )
    )
      .chain(image =>
        fromPredicateT(
          (img: UPNG.Image) => img.width > 0 && img.height > 0,
          () => imageValidationErrorResponse()
        )(image)
      )
      .foldTaskEither<
        IResponseErrorValidation | IResponseErrorInternal,
        // eslint-disable-next-line @typescript-eslint/ban-types
        IResponseSuccessRedirectToResource<{}, {}>
      >(
        imageValidationError => fromLeft(imageValidationError),
        () =>
          upsertBlobFromImageBuffer(
            blobService,
            "services",
            `${lowerCaseServiceId}.png`,
            bufferImage
          )
            .mapLeft(err =>
              ResponseErrorInternal(
                `Error trying to connect to storage ${err.message}`
              )
            )
            .chain(maybeResult =>
              maybeResult.foldL(
                () =>
                  fromLeft(
                    ResponseErrorInternal(
                      "Error trying to upload image logo on storage"
                    )
                  ),
                () =>
                  taskEither.of(
                    ResponseSuccessRedirectToResource(
                      {},
                      `${logosUrl}/services/${lowerCaseServiceId}.png`,
                      {}
                    )
                  )
              )
            )
      )
      .fold<
        | IResponseErrorValidation
        | IResponseErrorInternal
        // eslint-disable-next-line @typescript-eslint/ban-types
        | IResponseSuccessRedirectToResource<{}, {}>
      >(identity, identity)
      .run();
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function UploadServiceLogo(
  serviceModel: ServiceModel,
  blobService: BlobService,
  logosUrl: string
): express.RequestHandler {
  const handler = UpdateServiceLogoHandler(serviceModel, blobService, logosUrl);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extracts the ServiceId from the URL path parameter
    ServiceIdMiddleware,
    // Extracts the Logo payload from the request body
    LogoPayloadMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
