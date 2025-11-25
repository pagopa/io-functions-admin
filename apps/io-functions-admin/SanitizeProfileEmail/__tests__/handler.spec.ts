import { Container } from "@azure/cosmos";
import {
  ProfileModel,
  RetrievedProfile
} from "@pagopa/io-functions-commons/dist/src/models/profile";
import * as L from "@pagopa/logger";
import { hashFiscalCode } from "@pagopa/ts-commons/lib/hash";
import { EmailString, FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as ai from "applicationinsights";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { afterEach, assert, describe, expect, it, vi } from "vitest";

import { aFiscalCode, aRetrievedProfile } from "../../__mocks__/mocks";
import { ProfileToSanitize, sanitizeProfileEmail } from "../handler";

const fiscalCodes = {
  AFTER_EMAIL_OPT_OUT: "OPTOUT90O9O90009" as FiscalCode,
  EMAIL_CHANGED: "AAAAAA10A10A111A" as FiscalCode,
  EMAIL_NOT_VALIDATED: "CCCCCC30C30C333C" as FiscalCode,
  ERROR: "ERRORE10E10E111E" as FiscalCode,
  NOT_FOUND: aFiscalCode,
  TO_SANITIZE: "BBBBBB20B20B222B" as FiscalCode
};

const email = "test0@uee.pagopa.it" as EmailString;

const mocks = {
  email,
  fiscalCodes
};

vi.mock("applicationinsights");

const telemetryClient = vi.mocked(ai.defaultClient);

vi.mock("@pagopa/io-functions-commons/dist/src/models/profile");

vi.mocked(ProfileModel.prototype.findLastVersionByModelId).mockImplementation(
  ([fiscalCode]) => {
    switch (fiscalCode) {
      case mocks.fiscalCodes.AFTER_EMAIL_OPT_OUT:
        return TE.right(
          O.some({
            ...aRetrievedProfile,
            _ts: 1625781600,
            email: mocks.email,
            fiscalCode: mocks.fiscalCodes.AFTER_EMAIL_OPT_OUT,
            isEmailEnabled: true
          })
        );
      case mocks.fiscalCodes.EMAIL_CHANGED:
        // this profile changed its e-mail address
        return TE.right(O.some(aRetrievedProfile));
      case mocks.fiscalCodes.EMAIL_NOT_VALIDATED:
        // this profile has not yet validated its email
        return TE.right(
          O.some({ ...aRetrievedProfile, isEmailValidated: false })
        );
      case mocks.fiscalCodes.ERROR:
        return TE.left({
          error: new Error("test error"),
          kind: "COSMOS_ERROR_RESPONSE"
        });
      case mocks.fiscalCodes.TO_SANITIZE:
        // this is profile eligible to sanitification
        return TE.right(
          O.some({
            ...aRetrievedProfile,
            _ts: 1625711566,
            email: mocks.email,
            fiscalCode: mocks.fiscalCodes.TO_SANITIZE,
            isEmailEnabled: true
          })
        );
    }
    return TE.right(O.none);
  }
);
vi.mocked(ProfileModel.prototype.update).mockImplementation(
  (profile: RetrievedProfile) => TE.right(profile)
);

const profileModel = new ProfileModel({} as any as Container);

const ConsoleLogger: L.Logger = {
  format: L.format.json,
  log: r => () => console.log(r)
};

describe("Given a list a profiles to be sanitized with their duplicated e-mail addresses", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should only updates profiles that have a duplicated and validated e-mail address", async () => {
    // to be eligible for update a profile should have
    // 1. isEmailValidated = true
    // 2. the same e-mail address as input
    // 3. should have an item in the profile collection
    const profiles: ProfileToSanitize[] = [
      {
        email: mocks.email.toUpperCase() as EmailString,
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
      profiles.map(p =>
        sanitizeProfileEmail(p)({
          logger: ConsoleLogger,
          profileModel,
          telemetryClient
        })()
      )
    );

    expect(ProfileModel.prototype.update).toBeCalledTimes(1);
    expect(ProfileModel.prototype.update).toBeCalledWith(
      expect.objectContaining({
        fiscalCode: mocks.fiscalCodes.TO_SANITIZE,
        isEmailValidated: false
      })
    );

    expect(telemetryClient.trackEvent).toBeCalledTimes(1);
    expect(telemetryClient.trackEvent).toBeCalledWith(
      expect.objectContaining({
        name: "io.citizen-auth.reset_email_validation",
        tagOverrides: {
          "ai.user.id": hashFiscalCode(mocks.fiscalCodes.TO_SANITIZE),
          samplingEnabled: "false"
        }
      })
    );
  });

  it("should fail without creating new profile versions if there are errors retrieving the eligible profiles", async () => {
    const result = await sanitizeProfileEmail({
      email: mocks.email,
      fiscalCode: mocks.fiscalCodes.ERROR
    })({
      logger: ConsoleLogger,
      profileModel,
      telemetryClient
    })();
    if (E.isLeft(result)) {
      expect(ProfileModel.prototype.update).toBeCalledTimes(0);
    }
    expect.hasAssertions();
  });

  it.each([
    {
      fiscalCode: mocks.fiscalCodes.TO_SANITIZE,
      isEmailEnabled: false
    },
    {
      fiscalCode: mocks.fiscalCodes.AFTER_EMAIL_OPT_OUT,
      isEmailEnabled: true
    }
  ])(
    "should update isEmailEnabled based on profile latest update and opt out email switch date",
    async ({ fiscalCode, isEmailEnabled }) => {
      const result = await sanitizeProfileEmail({
        email: mocks.email,
        fiscalCode
      })({
        logger: ConsoleLogger,
        profileModel,
        telemetryClient
      })();
      if (E.isRight(result)) {
        expect(ProfileModel.prototype.update).toHaveBeenCalledWith(
          expect.objectContaining({
            fiscalCode,
            isEmailEnabled
          })
        );
      }
      expect.hasAssertions();
    }
  );
});
