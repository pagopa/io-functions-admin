import * as express from "express";

import { Context } from "@azure/functions";

import * as E from "fp-ts/lib/Either";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import {
  IResponseErrorConflict,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorFromValidationErrors,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, SandboxFiscalCode } from "@pagopa/ts-commons/lib/strings";

import { ExtendedProfile } from "@pagopa/io-functions-commons/dist/generated/definitions/ExtendedProfile";
import {
  NewProfile,
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import {
  AzureApiAuthMiddleware,
  IAzureApiAuthorization,
  UserGroup
} from "@pagopa/io-functions-commons/dist/src/utils/middlewares/azure_api_auth";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { SandboxFiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/sandboxfiscalcode";
import {
  IRequestMiddleware,
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";

import { ServicesPreferencesModeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicesPreferencesMode";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { pipe } from "fp-ts/lib/function";
import { DevelopmentProfile } from "../generated/definitions/DevelopmentProfile";

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function toExtendedProfile(profile: RetrievedProfile): ExtendedProfile {
  return {
    accepted_tos_version: profile.acceptedTosVersion,
    blocked_inbox_or_channels: profile.blockedInboxOrChannels,
    email: profile.email,
    // NOTE: We do NOT check email uniqueness in this context
    is_email_already_taken: false,
    is_email_enabled: profile.isEmailEnabled !== false,
    is_email_validated: profile.isEmailValidated !== false,
    is_inbox_enabled: profile.isInboxEnabled === true,
    is_webhook_enabled: profile.isWebhookEnabled === true,
    preferred_languages: profile.preferredLanguages,
    service_preferences_settings: profile.servicePreferencesSettings,
    version: profile.version
  };
}

/**
 * A middleware that extracts a DevelopmentProfile payload from a request.
 */
export const DeveloperProfilePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  DevelopmentProfile
> = request =>
  new Promise(resolve => {
    const result = pipe(
      request.body,
      DevelopmentProfile.decode,
      E.mapLeft(ResponseErrorFromValidationErrors(ExtendedProfile))
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function CreateDevelopmentProfileHandler(
  profileModel: ProfileModel
): ICreateDevelopmentProfileHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, _, sandboxFiscalCode, developmentProfilePayload) => {
    const logPrefix = `CreateDevelopmentProfileHandler|ENTITY_ID=${sandboxFiscalCode})`;

    const errorOrFiscalCode = FiscalCode.decode(sandboxFiscalCode);

    if (E.isLeft(errorOrFiscalCode)) {
      context.log.error(
        `${logPrefix}|ERROR=${readableReport(errorOrFiscalCode.left)}`
      );
      return ResponseErrorFromValidationErrors(FiscalCode)(
        errorOrFiscalCode.left
      );
    }

    const fiscalCode = errorOrFiscalCode.right;

    const newProfile: NewProfile = {
      email: developmentProfilePayload.email,
      fiscalCode,
      isInboxEnabled: true,
      isWebhookEnabled: true,
      kind: "INewProfile" as const,
      servicePreferencesSettings: {
        mode: ServicesPreferencesModeEnum.AUTO,
        version: 0 as NonNegativeInteger
      }
    };

    const errorOrCreatedProfile = await profileModel.create(newProfile)();

    if (E.isLeft(errorOrCreatedProfile)) {
      const error = errorOrCreatedProfile.left;
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

    const createdProfile = errorOrCreatedProfile.right;

    context.log.verbose(`${logPrefix}|SUCCESS`);

    return ResponseSuccessJson(toExtendedProfile(createdProfile));
  };
}

/**
 * Wraps an CreateDevelopmentProfile handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
