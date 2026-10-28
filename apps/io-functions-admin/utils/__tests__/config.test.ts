import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { assert, describe, expect, it } from "vitest";

import { IConfig } from "../config";

const aMailFrom = "example@test.com";

const noop = () => {};
const expectRight = <L, R>(e: E.Either<L, R>, t: (r: R) => void = noop) =>
  pipe(
    e,
    E.fold(
      _ =>
        assert.fail(
          `Expecting right, received left. Value: ${JSON.stringify(_)}`
        ),
      t
    )
  );

const expectLeft = <L, R>(e: E.Either<L, R>, t: (l: L) => void = noop) =>
  pipe(
    e,
    E.fold(t, _ =>
      assert.fail(`Expecting left, received right. Value: ${JSON.stringify(_)}`)
    )
  );

describe("IConfig", () => {
  it("requires CosmosDB metadata without requiring legacy credentials", () => {
    const result = IConfig.decode({});
    if (E.isRight(result)) {
      assert.fail("Expected the incomplete configuration to be rejected");
    }

    const invalidKeys = result.left.flatMap(error =>
      error.context.map(context => context.key)
    );

    expect(invalidKeys).toContain("COSMOSDB_URI");
    expect(invalidKeys).toContain("COSMOSDB_NAME");
    expect(invalidKeys).not.toContain("COSMOSDB_KEY");
    expect(invalidKeys).not.toContain("COSMOSDB_CONNECTION_STRING");
    expect(invalidKeys).not.toContain("CitizenAuthStorageConnection");
  });

  it("requires Blob endpoints and ignores legacy Blob connection strings", () => {
    const result = IConfig.decode({
      AssetsStorageConnection: "UseDevelopmentStorage=true",
      StorageConnection: "UseDevelopmentStorage=true",
      UserDataArchiveStorageConnection: "UseDevelopmentStorage=true",
      UserDataBackupStorageConnection: "UseDevelopmentStorage=true"
    });
    if (E.isRight(result)) {
      assert.fail("Expected endpoint-based Blob configuration to be required");
    }

    const invalidKeys = result.left.flatMap(error =>
      error.context.map(context => context.key)
    );

    expect(invalidKeys).toContain("ASSETS_STORAGE_BLOB_ENDPOINT");
    expect(invalidKeys).toContain("STORAGE_BLOB_ENDPOINT");
    expect(invalidKeys).toContain("USER_DATA_ARCHIVE_STORAGE_BLOB_ENDPOINT");
    expect(invalidKeys).toContain("USER_DATA_BACKUP_STORAGE_BLOB_ENDPOINT");
    expect(invalidKeys).not.toContain("AssetsStorageConnection");
    expect(invalidKeys).not.toContain("StorageConnection");
    expect(invalidKeys).not.toContain("UserDataArchiveStorageConnection");
    expect(invalidKeys).not.toContain("UserDataBackupStorageConnection");
  });

  it("requires Table and Queue endpoints instead of legacy connection strings", () => {
    const result = IConfig.decode({
      CitizenAuthStorageConnection: "UseDevelopmentStorage=true",
      FailedUserDataProcessingStorageConnection: "UseDevelopmentStorage=true",
      LOCKED_PROFILES_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
      PROFILE_EMAILS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
      SubscriptionFeedStorageConnection: "UseDevelopmentStorage=true"
    });
    if (E.isRight(result)) {
      assert.fail(
        "Expected endpoint-based Table and Queue settings to be required"
      );
    }

    const invalidKeys = result.left.flatMap(error =>
      error.context.map(context => context.key)
    );

    expect(invalidKeys).toContain("API_STORAGE_TABLE_ENDPOINT");
    expect(invalidKeys).toContain("SESSION_STORAGE_TABLE_ENDPOINT");
    expect(invalidKeys).toContain(
      "CitizenAuthQueueConnection__queueServiceUri"
    );
    expect(invalidKeys).not.toContain("CitizenAuthStorageConnection");
    expect(invalidKeys).not.toContain(
      "FailedUserDataProcessingStorageConnection"
    );
    expect(invalidKeys).not.toContain(
      "LOCKED_PROFILES_STORAGE_CONNECTION_STRING"
    );
    expect(invalidKeys).not.toContain(
      "PROFILE_EMAILS_STORAGE_CONNECTION_STRING"
    );
    expect(invalidKeys).not.toContain("SubscriptionFeedStorageConnection");
  });
});

describe("MailerConfig", () => {
  it("should decode configuration for sendgrid", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production",
      SENDGRID_API_KEY: "a-sg-key"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.SENDGRID_API_KEY).toBe("a-sg-key");
      expect(typeof value.MAILUP_USERNAME).toBe("undefined");
    });
  });

  it("should decode configuration for sendgrid even if mailup conf is passed", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAILUP_SECRET: "a-mu-secret",
      MAILUP_USERNAME: "a-mu-username",
      NODE_ENV: "production",
      SENDGRID_API_KEY: "a-sg-key"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.SENDGRID_API_KEY).toBe("a-sg-key");
    });
  });

  it("should decode configuration for mailup", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAILUP_SECRET: "a-mu-secret",
      MAILUP_USERNAME: "a-mu-username",
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAILUP_USERNAME).toBe("a-mu-username");
      expect(value.MAILUP_SECRET).toBe("a-mu-secret");
    });
  });

  it("should decode configuration with multi transport", () => {
    const aTransport = {
      password: "abc".repeat(5),
      transport: "transport-name",
      username: "t-username"
    };
    const aRawTrasport = [
      aTransport.transport,
      aTransport.username,
      aTransport.password
    ].join(":");

    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAIL_TRANSPORTS: [aRawTrasport, aRawTrasport].join(";"),
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAIL_TRANSPORTS).toEqual([aTransport, aTransport]);
    });
  });

  it("should decode configuration for mailhog", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAILHOG_HOSTNAME: "a-mh-host",
      NODE_ENV: "dev"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAILHOG_HOSTNAME).toBe("a-mh-host");
    });
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should require mailhog if not in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "dev"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should require at least on transporter if in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should not allow mailhog if in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAILHOG_HOSTNAME: "a-mh-host",
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should not decode configuration with empty transport", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      MAIL_TRANSPORTS: "",
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should not decode configuration when no transporter is specified", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  // eslint-disable-next-line vitest/expect-expect
  it("should not decode ambiguos configuration", () => {
    const withMailUp = {
      MAILUP_SECRET: "a-mu-secret",
      MAILUP_USERNAME: "a-mu-username"
    };
    const withSendGrid = {
      SENDGRID_API_KEY: "a-sg-key"
    };
    const withMultiTransport = {
      MAIL_TRANSPORTS: "a-trasnport-name"
    };
    const base = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production"
    };

    const examples = [
      // the following configuration is not ambiguos as sendgrid would override mailup anyway
      // see here for the rationale: https://github.com/pagopa/io-functions-admin/pull/89#commitcomment-42917672
      // { ...base, ...withMailUp, ...withSendGrid },
      { ...base, ...withMultiTransport, ...withSendGrid },
      { ...base, ...withMailUp, ...withMultiTransport },
      { ...base, ...withMailUp, ...withSendGrid, ...withMultiTransport }
    ];

    examples.map(MailerConfig.decode).forEach(_ => expectLeft(_));
  });
});
