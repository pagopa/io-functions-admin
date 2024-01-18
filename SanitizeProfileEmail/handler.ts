import { TelemetryClient } from "applicationinsights";

import * as t from "io-ts";

import { EmailString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { hashFiscalCode } from "@pagopa/ts-commons/lib/hash";

import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { pipe, flow } from "fp-ts/lib/function";

import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import * as L from "@pagopa/logger";

import { cosmosErrorsToString } from "../utils/errors";

export const ProfileToSanitize = t.type({
  email: EmailString,
  fiscalCode: FiscalCode
});

export type ProfileToSanitize = t.TypeOf<typeof ProfileToSanitize>;

interface IProfileModel {
  readonly profileModel: ProfileModel;
}

const getProfile = (fiscalCode: ProfileToSanitize["fiscalCode"]) => (
  r: IProfileModel
): TE.TaskEither<Error, O.Option<RetrievedProfile>> =>
  pipe(
    r.profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(flow(cosmosErrorsToString, Error))
  );

const isProfileEligibleForUpdate = (duplicatedEmail: EmailString) => (
  profile: RetrievedProfile
): boolean =>
  profile.isEmailValidated === true && profile.email === duplicatedEmail;

const getProfileForUpdate = (
  profile: ProfileToSanitize
): RTE.ReaderTaskEither<IProfileModel, Error, O.Option<RetrievedProfile>> =>
  pipe(
    getProfile(profile.fiscalCode),
    RTE.map(O.filter(isProfileEligibleForUpdate(profile.email)))
  );

// after this date, e-mail notification of IO messages becomes an opt-in feature
// so we should set "isEmailEnabled: false" to profiles that haven't updated before
// this date.
const OPT_OUT_EMAIL_SWITCH_DATE = 1625781600;

const updateProfile = (profile: RetrievedProfile) => (
  r: IProfileModel
): TE.TaskEither<Error, RetrievedProfile> =>
  pipe(
    r.profileModel.update({
      ...profile,
      isEmailEnabled:
        // eslint-disable-next-line no-underscore-dangle
        profile._ts < OPT_OUT_EMAIL_SWITCH_DATE
          ? false
          : profile.isEmailEnabled,
      isEmailValidated: false
    }),
    TE.mapLeft(flow(cosmosErrorsToString, Error))
  );

const trackResetEmailValidationEvent = (
  profile: Pick<RetrievedProfile, "fiscalCode">
) => (r: { readonly telemetryClient: TelemetryClient }) => (): void =>
  r.telemetryClient.trackEvent({
    name: "io.citizen-auth.reset_email_validation",
    tagOverrides: {
      samplingEnabled: "false",
      [r.telemetryClient.context.keys.userId]: hashFiscalCode(
        profile.fiscalCode
      )
    }
  });

export const sanitizeProfileEmail = flow(
  getProfileForUpdate,
  RTE.chainFirstW(maybe =>
    L.debugRTE("profile retrieved", {
      isProfileEligibleForUpdate: O.isSome(maybe)
    })
  ),
  RTE.chain(
    flow(
      O.map(
        flow(
          updateProfile,
          RTE.chainFirstW(() => L.debugRTE("profile updated")),
          RTE.chainFirstReaderIOKW(trackResetEmailValidationEvent)
        )
      ),
      O.getOrElse(() => RTE.right(void 0))
    )
  )
);
