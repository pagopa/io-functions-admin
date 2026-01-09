/**
 * This service retrieves and updates the user profile from the API system using
 * an API client.
 */

import { odata, TableClient, TransactionAction } from "@azure/data-tables";
import * as AI from "@pagopa/io-functions-commons/dist/src/utils/async_iterable_task";
import { DateFromString } from "@pagopa/ts-commons/lib/dates";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { flow, identity, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as ROA from "fp-ts/ReadonlyArray";
import * as t from "io-ts";

import { UnlockCode } from "../generated/definitions/UnlockCode";
import { errorsToError } from "../utils/errorHandler";

const MAX_TRANSACTION_ITEMS = 100;

// ----------------------------
// ----------------------------
// Types and Codecs
// ----------------------------
// ----------------------------

export type NotReleasedAuthenticationLockData = t.TypeOf<
  typeof NotReleasedAuthenticationLockData
>;
const NotReleasedAuthenticationLockData = t.exact(
  t.type({
    CreatedAt: DateFromString,
    partitionKey: FiscalCode,
    rowKey: UnlockCode,

    timestamp: DateFromString
  })
);

export type ReleasedAuthenticationLockData = t.TypeOf<
  typeof ReleasedAuthenticationLockData
>;
const ReleasedAuthenticationLockData = t.intersection([
  NotReleasedAuthenticationLockData,
  t.exact(
    t.type({
      Released: t.boolean
    })
  )
]);
export type AuthenticationLockData = t.TypeOf<typeof AuthenticationLockData>;
const AuthenticationLockData = t.union([
  // NB: Order matters
  // We first try to decode it as `ReleasedAuthenticationLockData`, then as `NotReleasedAuthenticationLockData`
  // otherwise we would lose Released value, if exists
  ReleasedAuthenticationLockData,
  NotReleasedAuthenticationLockData
]);

const AuthenticationLockDataArray = t.array(AuthenticationLockData);

// ----------------------------
// ----------------------------
// AuthenticationLockService
// ----------------------------
// ----------------------------

export default class AuthenticationLockService {
  constructor(private readonly tableClient: TableClient) {}

  /**
   * Delete the user authentication lock data
   *
   * @param fiscalCode the CF of the user
   * @param unlockCodes the Unlock Code list to delete
   * @returns
   */
  public readonly deleteUserAuthenticationLockData = (
    fiscalCode: FiscalCode,
    unlockCodes: readonly UnlockCode[]
  ): TE.TaskEither<Error, true> =>
    pipe(
      unlockCodes,
      ROA.chunksOf(MAX_TRANSACTION_ITEMS),
      ROA.map(
        flow(
          chunk =>
            chunk.map(
              unlockCode =>
                [
                  "delete",
                  {
                    partitionKey: fiscalCode,
                    rowKey: unlockCode
                  }
                ] as TransactionAction
            ),
          actions =>
            TE.tryCatch(
              () => this.tableClient.submitTransaction(actions),
              identity
            ),
          TE.filterOrElseW(
            response => response.status === 202,
            () => void 0
          )
        )
      ),
      // Sequentially execute chunk tasks: as soon as one fails, the procedure stops
      ROA.sequence(TE.ApplicativeSeq),
      TE.mapLeft(() => new Error("Something went wrong deleting the records")),
      TE.map(() => true as const)
    );

  /**
   * Retrieve all the user authentication lock data records, both released or not
   *
   * @param fiscalCode the user fiscal code
   * @returns a list of all the user authentication lock data, if exists
   */
  public readonly getAllUserAuthenticationLockData = (
    fiscalCode: FiscalCode
  ): TE.TaskEither<Error, readonly AuthenticationLockData[]> =>
    this.getAllUserAuthenticationLocks(fiscalCode);

  // -----------------------------------
  // Private Methods
  // -----------------------------------

  private readonly getAllUserAuthenticationLocks = (
    fiscalCode: FiscalCode
  ): TE.TaskEither<Error, readonly AuthenticationLockData[]> =>
    pipe(
      this.tableClient.listEntities({
        queryOptions: {
          filter: odata`PartitionKey eq ${fiscalCode}`
        }
      }),
      AI.fromAsyncIterable,
      AI.foldTaskEither(E.toError),
      TE.chainEitherK(
        flow(AuthenticationLockDataArray.decode, E.mapLeft(errorsToError))
      )
    );
}
