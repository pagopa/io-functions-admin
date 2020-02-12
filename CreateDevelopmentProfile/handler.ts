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
  Profile,
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

export function toExtendedProfile(profile: RetrievedProfile): ExtendedProfile {
  return {
    accepted_tos_version: profile.acceptedTosVersion,
    blocked_inbox_or_channels: profile.blockedInboxOrChannels,
    email: profile.email,
    is_email_enabled: profile.isEmailEnabled,
    is_email_validated: profile.isEmailValidated,
    is_inbox_enabled: profile.isInboxEnabled === true,
    is_webhook_enabled: profile.isWebhookEnabled === true,
    preferred_languages: profile.preferredLanguages,
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
  // tslint:disable-next-line: max-union-size
  | IResponseSuccessJson<ExtendedProfile>
  | IResponseErrorValidation
  | IResponseErrorQuery
  | IResponseErrorConflict
>;

export function CreateDevelopmentProfileHandler(
  profileModel: ProfileModel
): ICreateDevelopmentProfileHandler {
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

    const profile: Profile = {
      email: developmentProfilePayload.email,
      fiscalCode,
      isInboxEnabled: true,
      isWebhookEnabled: true
    };

    const errorOrCreatedProfile = await profileModel.create(
      profile,
      profile.fiscalCode
    );

    if (isLeft(errorOrCreatedProfile)) {
      const { code, body } = errorOrCreatedProfile.value;

      context.log.error(`${logPrefix}|ERROR=${body}`);

      // Conflict, resource already exists
      if (code === 409) {
        return ResponseErrorConflict(
          "A profile with the requested fiscal_code already exists"
        );
      }
      return ResponseErrorQuery(
        "Error while creating a new development profile",
        errorOrCreatedProfile.value
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
