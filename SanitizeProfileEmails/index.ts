import * as t from "io-ts";

import { EmailString, FiscalCode } from "@pagopa/ts-commons/lib/strings";

import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";
import * as A from "fp-ts/lib/Array";

import { uniq } from "fp-ts/lib/ReadonlyArray";
import { Eq } from "fp-ts/lib/Eq";

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

const profileToSanitizeEq: Eq<ProfileToSanitize> = {
  equals: (a, b) => a.fiscalCode === b.fiscalCode
};

interface IProfileModel {
  readonly profileModel: ProfileModel;
}

const getProfile = ({ fiscalCode, email }: ProfileToSanitize) => (
  r: IProfileModel
): TE.TaskEither<Error, O.Option<RetrievedProfile>> =>
  pipe(
    r.profileModel.findLastVersionByModelId([fiscalCode]),
    TE.mapLeft(flow(cosmosErrorsToString, Error)),
    TE.map(
      O.chain(profile =>
        profile.isEmailValidated === true && profile.email === email
          ? O.some(profile)
          : O.none
      )
    )
  );

const setProfileEmailAsNotValidated = (profile: RetrievedProfile) => (
  r: IProfileModel
): TE.TaskEither<Error, RetrievedProfile> =>
  pipe(
    r.profileModel.update({
      ...profile,
      isEmailValidated: false
    }),
    TE.mapLeft(flow(cosmosErrorsToString, Error))
  );

const setProfilesEmailsAsNotValidated = flow(
  A.map(setProfileEmailAsNotValidated),
  RTE.sequenceArray
);

const getProfilesEligibleForUpdate = flow(
  A.map(getProfile),
  RTE.sequenceArray,
  RTE.map(A.compact)
);

const removeDuplicatesFromInput = uniq(profileToSanitizeEq);

export const sanitizeProfileEmails = flow(
  removeDuplicatesFromInput,
  getProfilesEligibleForUpdate,
  RTE.chain(setProfilesEmailsAsNotValidated)
);
