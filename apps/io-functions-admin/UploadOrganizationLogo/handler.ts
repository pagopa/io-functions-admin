import { Context } from "@azure/functions";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import express from "express";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
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
  | IResponseErrorInternal
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

/**
 * Wraps an UploadOrganizationLogo handler inside an Express request handler.
 */

export function UploadOrganizationLogoHandler(
  blobService: BlobService,
  logosUrl: string
): IUploadOrganizationLogoHandler {
  return async (_, __, organizationFiscalCode, logoPayload) => {
    const bufferImage = Buffer.from(logoPayload.logo, "base64");
    const cleanedOrganizationFiscalCode = organizationFiscalCode.replace(
      /^0+/,
      ""
    );
    return pipe(
      O.tryCatch(() => UPNG.decode(bufferImage)),
      TE.fromOption(() => imageValidationErrorResponse()),
      TE.chain(image =>
        TE.fromPredicate(
          (img: UPNG.Image) => img.width > 0 && img.height > 0,
          () => imageValidationErrorResponse()
        )(image)
      ),
      TE.chainW(() =>
        pipe(
          upsertBlobFromImageBuffer(
            blobService,
            "services",
            `${cleanedOrganizationFiscalCode}.png`,
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
                    `${logosUrl}/services/${cleanedOrganizationFiscalCode}.png`,
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
