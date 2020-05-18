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
const blockedUserKeyPrefix = "BLOCKEDUSER-";
const userMetadataPrefix = "USERMETA-";

export const sessionNotFoundError = new Error("Session not found");

// a partial representation of an User, to not include the full model
const User = t.interface({
  fiscal_code: FiscalCode,
  session_token: SessionToken,
  wallet_token: WalletToken
});
type User = t.TypeOf<typeof User>;

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
    const sessionsOrError = await this.readSessionInfoKeys(fiscalCode);

    const delSingleSession = (
      token: SessionToken
    ): Promise<Either<Error, boolean>> =>
      this.loadSessionBySessionToken(token)
        .then(e => {
          const user: User = e.getOrElseL(err => {
            throw err;
          });
          return this.del(user.session_token, user.wallet_token);
        })
        .catch(_ => {
          // if I didn't find a user by it's token, I assume there's nothing about that user, so its data is deleted already
          return right<Error, boolean>(true);
        });

    const delEverySession = sessionTokens =>
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

    return fromEither(sessionsOrError)
      .foldTaskEither<Error, boolean>(
        _ => fromEither(right(true)),
        sessionInfoKeys =>
          delEverySession(
            sessionInfoKeys.map(sessionInfoKey =>
              sessionInfoKey.replace(sessionInfoKeyPrefix, "")
            )
          )
      )
      .run();
  }

  public delUserMetadataByFiscalCode(
    fiscalCode: string
  ): Promise<Either<Error, true>> {
    return new Promise<Either<Error, true>>(resolve => {
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
      this.redisClient.set(
        `${blockedUserKeyPrefix}${fiscalCode}`,
        JSON.stringify({ created_at: new Date().toISOString() }),
        "NX",
        err => resolve(err ? left(err) : right(true))
      );
    });
  }
  public unsetBlockedUser(fiscalCode: string): Promise<Either<Error, boolean>> {
    return new Promise<Either<Error, boolean>>(resolve => {
      this.redisClient.del(
        `${blockedUserKeyPrefix}${fiscalCode}`,
        (err, response) =>
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
      this.redisClient.smembers(
        `${userSessionsSetKeyPrefix}${fiscalCode}`,
        (err, response) => resolve(this.arrayStringReply(err, response))
      );
    });
  }

  private delSessionInfoKeys(
    fiscalCode: FiscalCode
  ): Promise<Either<Error, true>> {
    return new Promise<Either<Error, true>>(resolve => {
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
