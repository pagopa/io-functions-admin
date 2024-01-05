import * as t from "io-ts";

import { EmailString, FiscalCode } from "@pagopa/ts-commons/lib/strings";

import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { pipe, flow } from "fp-ts/lib/function";

import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";

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

const setProfileEmailAsNotValidated = (profile: RetrievedProfile) => (
  r: IProfileModel
): TE.TaskEither<Error, void> =>
  pipe(
    r.profileModel.update({
      ...profile,
      isEmailValidated: false
    }),
    TE.mapLeft(flow(cosmosErrorsToString, Error)),
    TE.map(() => void 0)
  );

export const sanitizeProfileEmail = flow(
  getProfileForUpdate,
  RTE.chain(
    flow(
      O.map(setProfileEmailAsNotValidated),
      O.getOrElse(() => RTE.right(void 0))
    )
  )
);
