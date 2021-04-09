import * as express from "express";

import { Context } from "@azure/functions";

import { isLeft } from "fp-ts/lib/Either";

import { readableReport } from "italia-ts-commons/lib/reporters";
import {
  IResponseErrorConflict,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorFromValidationErrors,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode, SandboxFiscalCode } from "italia-ts-commons/lib/strings";

import { ExtendedProfile } from "io-functions-commons/dist/generated/definitions/ExtendedProfile";
import {
  ProfileModel,
  RetrievedProfile
} from "io-functions-commons/dist/src/models/profile";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { SandboxFiscalCodeMiddleware } from "io-functions-commons/dist/src/utils/middlewares/sandboxfiscalcode";
import {
  IRequestMiddleware,
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";

import { DevelopmentProfile } from "../generated/definitions/DevelopmentProfile";

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function toExtendedProfile(profile: RetrievedProfile): ExtendedProfile {
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    accepted_tos_version: profile.acceptedTosVersion,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    blocked_inbox_or_channels: profile.blockedInboxOrChannels,
    email: profile.email,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    is_email_enabled: profile.isEmailEnabled,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    is_email_validated: profile.isEmailValidated,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    is_inbox_enabled: profile.isInboxEnabled === true,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    is_webhook_enabled: profile.isWebhookEnabled === true,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    preferred_languages: profile.preferredLanguages,
    version: profile.version
  };
}

/**
 * A middleware that extracts a DevelopmentProfile payload from a request.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DeveloperProfilePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  DevelopmentProfile
> = request =>
  new Promise(resolve => {
    const validation = DevelopmentProfile.decode(request.body);
    const result = validation.mapLeft(
      ResponseErrorFromValidationErrors(ExtendedProfile)
    );
    resolve(result);
  });

/**
 * Type of an CreateDevelopmentProfile handler.
 */
type ICreateDevelopmentProfileHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  sandboxFiscalCode: SandboxFiscalCode,
  developmentProfile: DevelopmentProfile
) => Promise<
  | IResponseSuccessJson<ExtendedProfile>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorConflict
>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function CreateDevelopmentProfileHandler(
  profileModel: ProfileModel
): ICreateDevelopmentProfileHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, sandboxFiscalCode, developmentProfilePayload) => {
    const logPrefix = `CreateDevelopmentProfileHandler|ENTITY_ID=${sandboxFiscalCode})`;

    const errorOrFiscalCode = FiscalCode.decode(sandboxFiscalCode);

    if (isLeft(errorOrFiscalCode)) {
      context.log.error(
        `${logPrefix}|ERROR=${readableReport(errorOrFiscalCode.value)}`
      );
      return ResponseErrorFromValidationErrors(FiscalCode)(
        errorOrFiscalCode.value
      );
    }

    const fiscalCode = errorOrFiscalCode.value;

    const newProfile = {
      email: developmentProfilePayload.email,
      fiscalCode,
      isInboxEnabled: true,
      isWebhookEnabled: true,
      kind: "INewProfile" as const
    };

    const errorOrCreatedProfile = await profileModel.create(newProfile).run();

    if (isLeft(errorOrCreatedProfile)) {
      const error = errorOrCreatedProfile.value;
      context.log.error(`${logPrefix}|ERROR=${error}`);

      if (error.kind === "COSMOS_ERROR_RESPONSE" && error.error.code === 409) {
        return ResponseErrorConflict(
          "A profile with the requested fiscal_code already exists"
        );
      }

      return ResponseErrorQuery(
        "Error while creating a new development profile",
        error
      );
    }

    const createdProfile = errorOrCreatedProfile.value;

    context.log.verbose(`${logPrefix}|SUCCESS`);

    return ResponseSuccessJson(toExtendedProfile(createdProfile));
  };
}

/**
 * Wraps an CreateDevelopmentProfile handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/naming-convention
export function CreateDevelopmentProfile(
  profileModel: ProfileModel
): express.RequestHandler {
  const handler = CreateDevelopmentProfileHandler(profileModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiDevelopmentProfileWrite])),
    SandboxFiscalCodeMiddleware,
    DeveloperProfilePayloadMiddleware
  );
  return wrapRequestHandler(middlewaresWrap(handler));
}
