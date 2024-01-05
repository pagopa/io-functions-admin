import { describe, it, jest } from "@jest/globals";

import { Container } from "@azure/cosmos";

import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";

import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";

import { EmailString, FiscalCode } from "@pagopa/ts-commons/lib/strings";

import { aFiscalCode, aRetrievedProfile } from "../../__mocks__/mocks";
import { ProfileToSanitize, sanitizeProfileEmail } from "../index";

const fiscalCodes = {
  TO_SANITIZE: "BBBBBB20B20B222B" as FiscalCode,
  EMAIL_CHANGED: "AAAAAA10A10A111A" as FiscalCode,
  EMAIL_NOT_VALIDATED: "CCCCCC30C30C333C" as FiscalCode,
  NOT_FOUND: aFiscalCode,
  ERROR: "ERRORE10E10E111E" as FiscalCode
};

const email = "test0@uee.pagopa.it" as EmailString;

const mocks = {
  email,
  fiscalCodes
};

jest.mock("@pagopa/io-functions-commons/dist/src/models/profile");

const MockedProfileModel = jest.mocked(ProfileModel);

MockedProfileModel.prototype.findLastVersionByModelId.mockImplementation(
  ([fiscalCode]) => {
    switch (fiscalCode) {
      case mocks.fiscalCodes.EMAIL_CHANGED:
        // this profile changed its e-mail address
        return TE.right(O.some(aRetrievedProfile));
      case mocks.fiscalCodes.TO_SANITIZE:
        // this is profile eligible to sanitification
        return TE.right(O.some({ ...aRetrievedProfile, email: mocks.email }));
      case mocks.fiscalCodes.EMAIL_NOT_VALIDATED:
        // this profile has not yet validated its email
        return TE.right(
          O.some({ ...aRetrievedProfile, isEmailValidated: false })
        );
      case mocks.fiscalCodes.ERROR:
        return TE.left({
          kind: "COSMOS_ERROR_RESPONSE",
          error: new Error("test error")
        });
    }
    return TE.right(O.none);
  }
);

MockedProfileModel.prototype.update.mockImplementation(
  (profile: RetrievedProfile) => TE.right(profile)
);

const profileModel = new MockedProfileModel(({} as any) as Container);

describe("Given a list a profiles to be sanitized with their duplicated e-mail addresses", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should only updates profiles that have a duplicated and validated e-mail address", async () => {
    // to be eligible for update a profile should have
    // 1. isEmailValidated = true
    // 2. the same e-mail address as input
    // 3. should have an item in the profile collection
    const profiles: ProfileToSanitize[] = [
      {
        email: mocks.email,
        fiscalCode: mocks.fiscalCodes.TO_SANITIZE
      },
      {
        email: mocks.email,
        fiscalCode: mocks.fiscalCodes.EMAIL_CHANGED
      },
      {
        email: mocks.email,
        fiscalCode: mocks.fiscalCodes.EMAIL_NOT_VALIDATED
      },
      {
        email: mocks.email,
        fiscalCode: mocks.fiscalCodes.NOT_FOUND
      }
    ];

    await Promise.all(
      profiles.map(p => sanitizeProfileEmail(p)({ profileModel })())
    );

    expect(MockedProfileModel.prototype.update).toBeCalledTimes(1);
    expect(MockedProfileModel.prototype.update).toBeCalledWith(
      expect.objectContaining({ isEmailValidated: false })
    );
  });

  it("should fail without creating new profile versions if there are errors retrieving the eligible profiles", async () => {
    const result = await sanitizeProfileEmail({
      email: mocks.email,
      fiscalCode: mocks.fiscalCodes.ERROR
    })({
      profileModel
    })();
    if (E.isLeft(result)) {
      expect(MockedProfileModel.prototype.update).toBeCalledTimes(0);
    }
    expect.hasAssertions();
  });
});
