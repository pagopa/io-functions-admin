/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// tslint:disable: no-console no-any

import { Context } from "@azure/functions";
import { Either, toError } from "fp-ts/lib/Either";
import { fromEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import extractUserDataActivity from "../ExtractUserDataActivity";
import setUserDataProcessingStatusActivity from "../setUserDataProcessingStatusActivity";

import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  UserDataProcessing
} from "io-functions-commons/dist/src/models/user_data_processing";
import {
  ActivityResultFailure as UserDataExtractionFailure,
  ActivityResultSuccess
} from "../ExtractUserDataActivity/handler";
import { ActivityResultFailure as SetUserDataProcessingStatusFailure } from "../SetUserDataProcessingStatusActivity/handler";

const context = ({
  log: console
  // tslint:disable-next-line: no-any
} as any) as Context;

const fromPromiseEither = <R>(
  lazyPromise: () => Promise<Either<any, R>>
): TaskEither<any, R> =>
  tryCatch(lazyPromise, toError).chain((queryErrorOrRecord: Either<any, R>) =>
    fromEither(queryErrorOrRecord)
  );

async function run(): Promise<
  Either<
    UserDataExtractionFailure | SetUserDataProcessingStatusFailure,
    ActivityResultSuccess
  >
> {
  const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
    throw new Error(`Invalid input: ${readableReport(reason)}`);
  });
  const currentUserDataProcessing = UserDataProcessing.decode({
    choice: UserDataProcessingChoiceEnum.DOWNLOAD,
    createdAt: new Date().toISOString(),
    fiscalCode,
    status: UserDataProcessingStatusEnum.PENDING,
    userDataProcessingId: makeUserDataProcessingId(
      UserDataProcessingChoiceEnum.DOWNLOAD,
      fiscalCode
    )
  }).getOrElseL(reason => {
    throw new Error(
      `Invalid user data processing record: ${readableReport(reason)}`
    );
  });

  const setToWipOrError = fromPromiseEither(() =>
    setUserDataProcessingStatusActivity(context, {
      currentRecord: currentUserDataProcessing,
      nextStatus: UserDataProcessingStatusEnum.WIP
    })
  );

  const createUserDataBundleOrError = fromPromiseEither(() =>
    extractUserDataActivity(context, { fiscalCode })
  );

  const setToClosedOrError = fromPromiseEither(() =>
    setUserDataProcessingStatusActivity(context, {
      currentRecord: currentUserDataProcessing,
      nextStatus: UserDataProcessingStatusEnum.CLOSED
    })
  );

  return setToWipOrError
    .chain(() => createUserDataBundleOrError)
    .chain(result => setToClosedOrError.map(() => result))
    .run();
}

run()
  .then(result => console.log("OK", result))
  .catch(ex => console.error("KO", ex));
