import type { BlobServiceClient } from "@azure/storage-blob";

import { InvocationContext } from "@azure/functions";
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
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as UPNG from "upng-js";

import { Logo as ApiLogo } from "../generated/definitions/Logo";
import { ServiceId } from "../generated/definitions/ServiceId";
import {
  getBlockBlobClient,
  uploadBlobFromBuffer
} from "../utils/blob_storage";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";
import { ServiceIdMiddleware } from "../utils/middlewares/serviceid";

type IUpdateServiceHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  serviceId: ServiceId,
  logoPayload: ApiLogo
) => Promise<
  | IResponseErrorInternal
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseSuccessRedirectToResource<object, object>
>;

const imageValidationErrorResponse = () =>
  ResponseErrorValidation(
    "Image not valid",
    "The base64 representation of the logo is invalid"
  );

const upsertBlobFromImageBuffer = (
  blobServiceClient: BlobServiceClient,
  containerName: string,
  blobName: string,
  content: Buffer
): TE.TaskEither<Error, true> =>
  TE.tryCatch(async () => {
    await uploadBlobFromBuffer(
      getBlockBlobClient(blobServiceClient, containerName, blobName),
      content,
      "image/png"
    );
    return true as const;
  }, E.toError);

export function UpdateServiceLogoHandler(
  serviceModel: ServiceModel,
  blobServiceClient: BlobServiceClient,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      O.tryCatch(() => UPNG.decode(bufferImage as any)),
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
            blobServiceClient,
            "services",
            `${lowerCaseServiceId}.png`,
            bufferImage
          ),
          TE.mapLeft(err =>
            ResponseErrorInternal(
              `Error trying to connect to storage ${err.message}`
            )
          ),
          TE.map(() =>
            ResponseSuccessRedirectToResource(
              {},
              `${logosUrl}/services/${lowerCaseServiceId}.png`,
              {}
            )
          )
        )
      ),
      TE.toUnion
    )();
  };
}

export function UploadServiceLogo(
  serviceModel: ServiceModel,
  blobServiceClient: BlobServiceClient,
  logosUrl: string
) {
  const handler = UpdateServiceLogoHandler(
    serviceModel,
    blobServiceClient,
    logosUrl
  );

  const middlewares = [
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    ServiceIdMiddleware,
    LogoPayloadMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}
