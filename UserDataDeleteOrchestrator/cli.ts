/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// tslint:disable: no-console no-any

import * as dotenv from "dotenv";
dotenv.config();

import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import RedisSessionStorage from "./session-utils/redisSessionStorage";

import DeleteUserDataActivity from "../DeleteUserDataActivity";
import SetUserDataProcessingStatusActivity from "../SetUserDataProcessingStatusActivity";
import getUserDataProcessing from "./GetUserDataProcessing";

import { sequenceT } from "fp-ts/lib/Apply";
import { Either, toError } from "fp-ts/lib/Either";
import { taskEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  UserDataProcessing,
  UserDataProcessingId
} from "io-functions-commons/dist/src/models/user_data_processing";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { NodeEnvironmentEnum } from "italia-ts-commons/lib/environment";
import { getNodeEnvironmentFromProcessEnv } from "italia-ts-commons/lib/environment";

import { Context } from "@azure/functions";
import {
  createClusterRedisClient,
  createSimpleRedisClient
} from "./session-utils/redis";
const trace = (l: string) => (e: any) => {
  console.log(l, e);
  return e;
};

const context = ({
  log: {
    error: console.error,
    info: console.log,
    verbose: console.log
  }
  // tslint:disable-next-line: no-any
} as any) as Context;

const REDIS_CLIENT =
  getNodeEnvironmentFromProcessEnv(process.env) ===
  NodeEnvironmentEnum.DEVELOPMENT
    ? createSimpleRedisClient(process.env.REDIS_URL)
    : createClusterRedisClient(
        getRequiredStringEnv("REDIS_URL"),
        process.env.REDIS_PASSWORD,
        process.env.REDIS_PORT
      );
// Create the Session Storage service
const SESSION_STORAGE = new RedisSessionStorage(REDIS_CLIENT);

// before deleting data we block the user and clrear all its session data
const blockUser = (fiscalCode: FiscalCode): TaskEither<Error, boolean> => {
  const delByFiscalCode = tryCatch(
    () =>
      SESSION_STORAGE.delByFiscalCode(fiscalCode)
        .then(trace("delByFiscalCode"))
        .then(e =>
          e.getOrElseL((err: any) => {
            throw err;
          })
        ),
    toError
  );

  const delUserMetadataByFiscalCode = tryCatch(
    () =>
      SESSION_STORAGE.delUserMetadataByFiscalCode(fiscalCode)
        .then(trace("delUserMetadataByFiscalCode"))
        .then(e =>
          e.getOrElseL((err: any) => {
            throw err;
          })
        ),
    toError
  );

  const setBlockedUser = tryCatch(
    () =>
      SESSION_STORAGE.setBlockedUser(fiscalCode)
        .then(trace("setBlockedUser"))
        .then(e =>
          e.getOrElseL((err: any) => {
            throw err;
          })
        ),
    toError
  );

  return sequenceT(taskEither)(
    delByFiscalCode,
    delUserMetadataByFiscalCode
  ).chain(_ => setBlockedUser);
};

// delete all user data from our db
const deleteUserData = (
  fiscalCode: FiscalCode,
  userDataProcessingId: UserDataProcessingId
): TaskEither<Error, true> =>
  tryCatch(
    () =>
      DeleteUserDataActivity(context, {
        fiscalCode,
        userDataDeleteRequestId: userDataProcessingId
      }).then(result => {
        if (result.kind !== "SUCCESS") {
          throw new Error(
            `DeleteUserDataActivity failed: ${result.kind} error`
          );
        }
        return true;
      }),
    toError
  );

// change status on user request
const setUserDataProcessingStatus = (
  currentUserDataProcessing: UserDataProcessing,
  nextStatus: UserDataProcessingStatusEnum
): TaskEither<Error, true> =>
  tryCatch(
    () =>
      SetUserDataProcessingStatusActivity(context, {
        currentRecord: currentUserDataProcessing,
        nextStatus
      }).then(result => {
        if (result.kind !== "SUCCESS") {
          throw new Error(
            `SetUserDataProcessingStatusActivity to ${nextStatus} failed: ${result.kind} error`
          );
        }
        return true;
      }),
    toError
  );

// after the operation, unblock the user to allow another login
const unblockUser = (fiscalCode: FiscalCode): TaskEither<Error, true> =>
  tryCatch(
    () =>
      SESSION_STORAGE.unsetBlockedUser(fiscalCode)
        .then(trace("unsetBlockedUser"))
        .then(e =>
          e.getOrElseL((err: Error) => {
            throw err;
          })
        ),
    toError
  );

async function run(): Promise<Either<Error, boolean>> {
  const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
    throw new Error(`Invalid input: ${readableReport(reason)}`);
  });

  const userDataProcessingResult = await getUserDataProcessing(context, {
    choice: UserDataProcessingChoiceEnum.DELETE,
    fiscalCode
  });

  if (userDataProcessingResult.kind === "RECORD_NOT_FOUND") {
    throw new Error(`No data delete has been requested for the current user`);
  } else if (userDataProcessingResult.kind !== "SUCCESS") {
    throw new Error("Failed retrieving userDataProcessing");
  } else if (
    userDataProcessingResult.value.status !==
      UserDataProcessingStatusEnum.PENDING &&
    userDataProcessingResult.value.status !==
      UserDataProcessingStatusEnum.FAILED
  ) {
    throw new Error("User data processing status !== PENDING & != FAILED");
  } else {
    console.log(
      "Found user data processing request with status %s",
      userDataProcessingResult.value.status
    );
  }

  return blockUser(fiscalCode)
    .chain(_ =>
      setUserDataProcessingStatus(
        userDataProcessingResult.value,
        UserDataProcessingStatusEnum.WIP
      )
    )
    .chain(_ =>
      deleteUserData(
        fiscalCode,
        userDataProcessingResult.value.userDataProcessingId
      )
    )
    .chain(_ => unblockUser(fiscalCode))
    .chain(_ =>
      setUserDataProcessingStatus(
        userDataProcessingResult.value,
        UserDataProcessingStatusEnum.CLOSED
      )
    )
    .foldTaskEither(
      _ => {
        console.log("Something went wrong. Mark the requeste as FAILED");
        // mark as failed
        return setUserDataProcessingStatus(
          userDataProcessingResult.value,
          UserDataProcessingStatusEnum.FAILED
        );
      },
      // just pass
      e => taskEither.of(e)
    )
    .run();
}

run()
  .then(_ => REDIS_CLIENT.quit())
  .then(result => console.log("OK", result))
  .catch(ex => console.error("KO", ex));
