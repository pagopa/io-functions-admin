import { Context } from "@azure/functions";

import * as express from "express";

import { left, right } from "fp-ts/lib/Either";
import { fromNullable } from "fp-ts/lib/Option";

import {
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";

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
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as UPNG from "upng-js";
import { Logo as ApiLogo } from "../generated/definitions/Logo";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";

type IUploadOrganizationLogoHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  organizationFiscalCode: OrganizationFiscalCode,
  logoPayload: ApiLogo
) => Promise<
  // eslint-disable-next-line @typescript-eslint/ban-types
  | IResponseSuccessRedirectToResource<{}, {}>
  | IResponseErrorValidation
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadOrganizationLogoHandler(
  blobService: BlobService,
  logosUrl: string
): IUploadOrganizationLogoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (_, __, organizationFiscalCode, logoPayload) => {
    const bufferImage = Buffer.from(logoPayload.logo, "base64");
    const cleanedOrganizationFiscalCode = organizationFiscalCode.replace(
      /^0+/,
      ""
    );
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
            `${cleanedOrganizationFiscalCode}.png`,
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
                      `${logosUrl}/services/${cleanedOrganizationFiscalCode}.png`,
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
 * Wraps an UploadOrganizationLogo handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function UploadOrganizationLogo(
  blobService: BlobService,
  logosUrl: string
): express.RequestHandler {
  const handler = UploadOrganizationLogoHandler(blobService, logosUrl);

  const middlewaresWrap = withRequestMiddlewares(
    // Extract Azure Functions bindings
    ContextMiddleware(),
    // Allow only users in the ApiServiceWrite group
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    // Extract organization Fiscal code from path
    RequiredParamMiddleware("organizationfiscalcode", OrganizationFiscalCode),
    // Extracts the Logo payload from the request body
    LogoPayloadMiddleware
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
