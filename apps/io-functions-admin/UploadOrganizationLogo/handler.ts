import type { BlobServiceClient } from "@azure/storage-blob";

import { InvocationContext } from "@azure/functions";
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessRedirectToResource,
  ResponseErrorInternal,
  ResponseErrorValidation,
  ResponseSuccessRedirectToResource
} from "@pagopa/ts-commons/lib/responses";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as UPNG from "upng-js";

import { Logo as ApiLogo } from "../generated/definitions/Logo";
import {
  getBlockBlobClient,
  uploadBlobFromBuffer
} from "../utils/blob_storage";
import { LogoPayloadMiddleware } from "../utils/middlewares/service";

type IUploadOrganizationLogoHandler = (
  context: InvocationContext,
  auth: IAzureApiAuthorization,
  organizationFiscalCode: OrganizationFiscalCode,
  logoPayload: ApiLogo
) => Promise<
  | IResponseErrorInternal
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
  }, toError);

export function UploadOrganizationLogo(
  blobServiceClient: BlobServiceClient,
  logosUrl: string
) {
  const handler = UploadOrganizationLogoHandler(blobServiceClient, logosUrl);

  const middlewares = [
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiServiceWrite])),
    RequiredParamMiddleware("organizationFiscalCode", OrganizationFiscalCode),
    LogoPayloadMiddleware
  ] as const;

  return wrapHandlerV4(middlewares, handler);
}

export function UploadOrganizationLogoHandler(
  blobServiceClient: BlobServiceClient,
  logosUrl: string
): IUploadOrganizationLogoHandler {
  return async (_, __, organizationFiscalCode, logoPayload) => {
    const bufferImage = Buffer.from(logoPayload.logo, "base64");
    const cleanedOrganizationFiscalCode = organizationFiscalCode.replace(
      /^0+/,
      ""
    );
    return pipe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      O.tryCatch(() => UPNG.decode(bufferImage as any)),
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
            blobServiceClient,
            "services",
            `${cleanedOrganizationFiscalCode}.png`,
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
              `${logosUrl}/services/${cleanedOrganizationFiscalCode}.png`,
              {}
            )
          )
        )
      ),
      TE.toUnion
    )();
  };
}
