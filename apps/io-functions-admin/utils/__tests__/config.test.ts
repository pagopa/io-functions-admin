import * as E from "fp-ts/lib/Either";
import { MailerConfig } from "@pagopa/io-functions-commons/dist/src/mailer";
import { pipe } from "fp-ts/lib/function";

const aMailFrom = "example@test.com";

const noop = () => {};
const expectRight = <L, R>(e: E.Either<L, R>, t: (r: R) => void = noop) =>
  pipe(
    e,
    E.fold(
      _ => fail(`Expecting right, received left. Value: ${JSON.stringify(_)}`),
      t
    )
  );

const expectLeft = <L, R>(e: E.Either<L, R>, t: (l: L) => void = noop) =>
  pipe(
    e,
    E.fold(t, _ =>
      fail(`Expecting left, received right. Value: ${JSON.stringify(_)}`)
    )
  );

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
      NODE_ENV: "production",
      SENDGRID_API_KEY: "a-sg-key",
      MAILUP_USERNAME: "a-mu-username",
      MAILUP_SECRET: "a-mu-secret"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.SENDGRID_API_KEY).toBe("a-sg-key");
    });
  });

  it("should decode configuration for mailup", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production",
      MAILUP_USERNAME: "a-mu-username",
      MAILUP_SECRET: "a-mu-secret"
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
      NODE_ENV: "production",
      MAIL_TRANSPORTS: [aRawTrasport, aRawTrasport].join(";")
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAIL_TRANSPORTS).toEqual([aTransport, aTransport]);
    });
  });

  it("should decode configuration for mailhog", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "dev",
      MAILHOG_HOSTNAME: "a-mh-host"
    };
    const result = MailerConfig.decode(rawConf);

    expectRight(result, value => {
      expect(value.MAILHOG_HOSTNAME).toBe("a-mh-host");
    });
  });

  it("should require mailhog if not in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "dev"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should require at least on transporter if in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not allow mailhog if in prod", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production",
      MAILHOG_HOSTNAME: "a-mh-host"
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode configuration with empty transport", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom,
      NODE_ENV: "production",
      MAIL_TRANSPORTS: ""
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode configuration when no transporter is specified", () => {
    const rawConf = {
      MAIL_FROM: aMailFrom
    };
    const result = MailerConfig.decode(rawConf);

    expectLeft(result);
  });

  it("should not decode ambiguos configuration", () => {
    const withMailUp = {
      MAILUP_USERNAME: "a-mu-username",
      MAILUP_SECRET: "a-mu-secret"
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
