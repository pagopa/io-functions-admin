import * as express from "express";

import { Context } from "@azure/functions";

import { isLeft } from "fp-ts/lib/Either";

import {
  IResponseSuccessJson,
  ResponseErrorFromValidationErrors,
  ResponseSuccessJson
} from "italia-ts-commons/lib/responses";
import { FiscalCode } from "italia-ts-commons/lib/strings";

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
import { FiscalCodeMiddleware } from "io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  IRequestMiddleware,
  withRequestMiddlewares,
  wrapRequestHandler
} from "io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "io-functions-commons/dist/src/utils/response";

export function toExtendedProfile(profile: RetrievedProfile): ExtendedProfile {
  return {
    accepted_tos_version: profile.acceptedTosVersion,
    blocked_inbox_or_channels: profile.blockedInboxOrChannels,
    email: profile.email,
    is_inbox_enabled: profile.isInboxEnabled === true,
    is_webhook_enabled: profile.isWebhookEnabled === true,
    preferred_languages: profile.preferredLanguages,
    version: profile.version
  };
}

/**
 * A middleware that extracts a Profile payload from a request.
 */
export const ProfilePayloadMiddleware: IRequestMiddleware<
  "IResponseErrorValidation",
  ExtendedProfile
> = request =>
  new Promise(resolve => {
    const validation = ExtendedProfile.decode(request.body);
    const result = validation.mapLeft(
      ResponseErrorFromValidationErrors(ExtendedProfile)
    );
    resolve(result);
  });

/**
 * Type of an CreateProfile handler.
 */
type ICreateProfileHandler = (
  context: Context,
  auth: IAzureApiAuthorization,
  fiscalCode: FiscalCode,
  profile: ExtendedProfile
) => Promise<IResponseSuccessJson<ExtendedProfile> | IResponseErrorQuery>;

export function CreateProfileHandler(
  profileModel: ProfileModel
): ICreateProfileHandler {
  return async (context, _, fiscalCode, profilePayload) => {
    const logPrefix = `CreateProfileHandler|ENTITY_ID=${fiscalCode})`;
    const profile: Profile = {
      acceptedTosVersion: profilePayload.accepted_tos_version,
      blockedInboxOrChannels: profilePayload.blocked_inbox_or_channels,
      email: profilePayload.email,
      fiscalCode,
      isInboxEnabled: profilePayload.is_inbox_enabled,
      isWebhookEnabled: profilePayload.is_webhook_enabled,
      preferredLanguages: profilePayload.preferred_languages
    };

    const errorOrCreatedProfile = await profileModel.create(
      profile,
      profile.fiscalCode
    );

    if (isLeft(errorOrCreatedProfile)) {
      context.log.error(
        `${logPrefix}|ERROR=${errorOrCreatedProfile.value.body}`
      );
      return ResponseErrorQuery(
        "Error while creating a new profile",
        errorOrCreatedProfile.value
      );
    }

    const createdProfile = errorOrCreatedProfile.value;

    context.log.verbose(`${logPrefix}|SUCCESS`);

    return ResponseSuccessJson(toExtendedProfile(createdProfile));
  };
}

/**
 * Wraps an CreateProfile handler inside an Express request handler.
 */
export function CreateProfile(
  profileModel: ProfileModel
): express.RequestHandler {
  const handler = CreateProfileHandler(profileModel);

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    AzureApiAuthMiddleware(new Set([UserGroup.ApiProfileWrite])),
    FiscalCodeMiddleware,
    ProfilePayloadMiddleware
  );
  return wrapRequestHandler(middlewaresWrap(handler));
}
