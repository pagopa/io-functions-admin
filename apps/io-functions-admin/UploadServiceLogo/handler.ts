import { Context } from "@azure/functions";
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
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { BlobService } from "azure-storage";
import express from "express";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseSuccessRedirectToResource<{}, {}>
>;

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
): TE.TaskEither<Error, O.Option<BlobService.BlobResult>> =>
  pipe(
    TE.taskify<Error, BlobService.BlobResult>(cb =>
      blobService.createBlockBlobFromText(containerName, blobName, content, cb)
    )(),
    TE.map(O.fromNullable)
  );

export function UpdateServiceLogoHandler(
  serviceModel: ServiceModel,
  blobService: BlobService,
  logosUrl: string
): IUpdateServiceHandler {
  return async (_, __, serviceId, logoPayload) => {
    const errorOrMaybeRetrievedService =
      await serviceModel.findOneByServiceId(serviceId)();
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

    const bufferImage = Buffer.from(logoPayload.logo, "base64");
    const lowerCaseServiceId = serviceId.toLowerCase();
    return pipe(
      O.tryCatch(() => UPNG.decode(bufferImage)),
      O.fold(
        () =>
          E.left<IResponseErrorValidation, UPNG.Image>(
            imageValidationErrorResponse()
          ),
        img => E.right<IResponseErrorValidation, UPNG.Image>(img)
      ),
      TE.fromEither,
      TE.chain(
        TE.fromPredicate(
          (img: UPNG.Image) => img.width > 0 && img.height > 0,
          () => imageValidationErrorResponse()
        )
      ),
      TE.chainW(() =>
        pipe(
          upsertBlobFromImageBuffer(
            blobService,
            "services",
            `${lowerCaseServiceId}.png`,
            bufferImage
          ),

          TE.mapLeft(err =>
            ResponseErrorInternal(
              `Error trying to connect to storage ${err.message}`
            )
          ),
          TE.chain(
            O.fold(
              () =>
                TE.left(
                  ResponseErrorInternal(
                    "Error trying to upload image logo on storage"
                  )
                ),
              () =>
                TE.of(
                  ResponseSuccessRedirectToResource(
                    {},
                    `${logosUrl}/services/${lowerCaseServiceId}.png`,
                    {}
                  )
                )
            )
          )
        )
      ),
      TE.toUnion
    )();
  };
}

/**
 * Wraps a UpdateService handler inside an Express request handler.
 */

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
