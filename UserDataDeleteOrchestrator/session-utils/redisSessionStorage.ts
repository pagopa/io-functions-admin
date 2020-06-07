/**
 * This service uses the Redis client to store and retrieve session information.
 */
import { array } from "fp-ts/lib/Array";
import {
  Either,
  isLeft,
  left,
  parseJSON,
  right,
  toError
} from "fp-ts/lib/Either";
import { fromEither, taskEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { errorsToReadableMessages } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import * as redis from "redis";
import { isArray } from "util";
import { multipleErrorsFormatter } from "./errorsFormatter";
import { SessionToken, WalletToken } from "./token";

import RedisStorageUtils from "./redisStorageUtils";

const sessionKeyPrefix = "SESSION-";
const walletKeyPrefix = "WALLET-";
const userSessionsSetKeyPrefix = "USERSESSIONS-";
const sessionInfoKeyPrefix = "SESSIONINFO-";
const blockedUserSetKey = "BLOCKEDUSERS";
const userMetadataPrefix = "USERMETA-";

export const sessionNotFoundError = new Error("Session not found");

// a partial representation of an User, to not include the full model
const User = t.interface({
  fiscal_code: FiscalCode,
  session_token: SessionToken,
  wallet_token: WalletToken
});
type User = t.TypeOf<typeof User>;

const log = console;

export default class RedisSessionStorage extends RedisStorageUtils {
  constructor(private readonly redisClient: redis.RedisClient) {
    super();
  }

  /**
   * Delete all user session data
   * @param fiscalCode
   */
  public async delByFiscalCode(
    fiscalCode: FiscalCode
  ): Promise<Either<Error, boolean>> {
    const errorOrSessions = await this.readSessionInfoKeys(fiscalCode);

    const delSingleSession = (
      token: SessionToken
    ): Promise<Either<Error, boolean>> => {
      return this.loadSessionBySessionToken(token)
        .then(e => {
          const user: User = e.getOrElseL(err => {
            throw err;
          });
          log.info(`Deleting user session ${token}`);
          return this.del(user.session_token, user.wallet_token);
        })
        .catch(err => {
          // if we didn't find a user by session token, we assume
          // the session is empty because already deleted or expired
          return right<Error, boolean>(true);
        });
    };

    const delEverySession = (sessionTokens: readonly string[]) =>
      array
        .sequence(taskEither)<Error, boolean>(
          sessionTokens.map(sessionInfoKey =>
            fromEither<Error, SessionToken>(
              SessionToken.decode(sessionInfoKey).mapLeft(
                _ => new Error("Error decoding token")
              )
            ).chain<boolean>((token: SessionToken) =>
              tryCatch(() => delSingleSession(token), toError).chain(fromEither)
            )
          )
        )
        .chain(_ =>
          tryCatch(() => this.delSessionInfoKeys(fiscalCode), toError).chain(
            fromEither
          )
        );

    return fromEither(errorOrSessions)
      .foldTaskEither<Error, boolean>(
        err => {
          log.error(`Error getting session list: ${err}`);
          return fromEither(right(true));
        },
        sessionInfoKeys => {
          log.info(`Deleting ${sessionInfoKeys.length} user's sessions`);
          return delEverySession(
            sessionInfoKeys.map(sessionInfoKey =>
              sessionInfoKey.replace(sessionInfoKeyPrefix, "")
            )
          );
        }
      )
      .run();
  }

  public delUserMetadataByFiscalCode(
    fiscalCode: string
  ): Promise<Either<Error, true>> {
    return new Promise<Either<Error, true>>(resolve => {
      log.info(`Deleting metadata for ${fiscalCode}`);
      this.redisClient.del(`${userMetadataPrefix}${fiscalCode}`, err => {
        if (err) {
          resolve(left(err));
        } else {
          resolve(right(true));
        }
      });
    });
  }

  public setBlockedUser(fiscalCode: string): Promise<Either<Error, boolean>> {
    return new Promise<Either<Error, boolean>>(resolve => {
      log.info(`Adding ${fiscalCode} to ${blockedUserSetKey} set`);
      this.redisClient.sadd(blockedUserSetKey, fiscalCode, err =>
        resolve(err ? left(err) : right(true))
      );
    });
  }
  public unsetBlockedUser(fiscalCode: string): Promise<Either<Error, boolean>> {
    return new Promise<Either<Error, boolean>>(resolve => {
      log.info(`Removing ${fiscalCode} from ${blockedUserSetKey} set`);
      this.redisClient.srem(blockedUserSetKey, fiscalCode, (err, response) =>
        resolve(
          this.falsyResponseToError(
            this.integerReply(err, response, 1),
            new Error(
              "Unexpected response from redis client deleting blockedUserKey"
            )
          )
        )
      );
    });
  }

  /**
   * Return a Session for this token.
   */
  private async loadSessionBySessionToken(
    token: SessionToken
  ): Promise<Either<Error, User>> {
    return new Promise(resolve => {
      log.info(`Reading user session for token ${token}`);
      this.redisClient.get(`${sessionKeyPrefix}${token}`, (err, value) => {
        if (err) {
          // Client returns an error.
          return resolve(left<Error, User>(err));
        }

        if (value === null) {
          return resolve(left<Error, User>(sessionNotFoundError));
        }
        const errorOrDeserializedUser = this.parseUser(value);
        return resolve(errorOrDeserializedUser);
      });
    });
  }

  /**
   * {@inheritDoc}
   */
  private async del(
    sessionToken: SessionToken,
    walletToken: WalletToken
  ): Promise<Either<Error, boolean>> {
    const deleteSessionTokens = new Promise<Either<Error, true>>(resolve => {
      log.info(`Deleting session token ${sessionToken}`);
      // Remove the specified key. A key is ignored if it does not exist.
      // @see https://redis.io/commands/del
      this.redisClient.del(
        `${sessionKeyPrefix}${sessionToken}`,
        (err, response) =>
          resolve(
            this.falsyResponseToError(
              this.integerReply(err, response, 1),
              new Error(
                "Unexpected response from redis client deleting sessionInfoKey and sessionToken."
              )
            )
          )
      );
    });

    const deleteWalletToken = new Promise<Either<Error, true>>(resolve => {
      log.info(`Deleting wallet token ${walletToken}`);
      // Remove the specified key. A key is ignored if it does not exist.
      // @see https://redis.io/commands/del
      this.redisClient.del(
        `${walletKeyPrefix}${walletToken}`,
        (err, response) =>
          resolve(
            this.falsyResponseToError(
              this.integerReply(err, response, 1),
              new Error(
                "Unexpected response from redis client deleting walletToken."
              )
            )
          )
      );
    });

    const deletePromises = await Promise.all([
      deleteSessionTokens,
      deleteWalletToken
    ]);

    const isDeleteFailed = deletePromises.some(isLeft);
    if (isDeleteFailed) {
      return left<Error, boolean>(
        multipleErrorsFormatter(
          deletePromises.filter(isLeft).map(_ => _.value),
          "RedisSessionStorage.del"
        )
      );
    }
    return right<Error, boolean>(true);
  }

  private readSessionInfoKeys(
    fiscalCode: FiscalCode
  ): Promise<Either<Error, ReadonlyArray<string>>> {
    return new Promise<Either<Error, ReadonlyArray<string>>>(resolve => {
      log.info(`Reading session list ${userSessionsSetKeyPrefix}${fiscalCode}`);
      this.redisClient.smembers(
        `${userSessionsSetKeyPrefix}${fiscalCode}`,
        (err, response) => {
          if (err) {
            return resolve(left(err));
          }
          resolve(this.arrayStringReply(err, response));
        }
      );
    });
  }

  private delSessionInfoKeys(
    fiscalCode: FiscalCode
  ): Promise<Either<Error, true>> {
    return new Promise<Either<Error, true>>(resolve => {
      log.info(
        `Deleting session info ${userSessionsSetKeyPrefix}${fiscalCode}`
      );
      this.redisClient.del(`${userSessionsSetKeyPrefix}${fiscalCode}`, err =>
        resolve(err ? left(err) : right(true))
      );
    });
  }

  private arrayStringReply(
    err: Error | null,
    replay: ReadonlyArray<string> | undefined
  ): Either<Error, ReadonlyArray<string>> {
    if (err) {
      return left(err);
    } else if (!isArray(replay) || replay.length === 0) {
      return left(sessionNotFoundError);
    }
    return right(replay);
  }

  private parseUser(value: string): Either<Error, User> {
    return parseJSON<Error>(value, toError).chain(data => {
      return User.decode(data).mapLeft(err => {
        return new Error(errorsToReadableMessages(err).join("/"));
      });
    });
  }
}
