/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// tslint:disable: no-console no-any

import * as dotenv from "dotenv";
dotenv.config();

import { Context } from "@azure/functions";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import extractUserDataActivity from "../ExtractUserDataActivity";
import sendUserDataDownloadMessageActivity from "../SendUserDataDownloadMessageActivity";
import setUserDataProcessingStatusActivity from "../SetUserDataProcessingStatusActivity";

import { toString } from "fp-ts/lib/function";

import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "io-functions-commons/dist/src/models/user_data_processing";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { cosmosdbClient } from "../utils/cosmosdb";

const context = ({
  log: {
    error: console.error,
    info: console.log,
    verbose: console.log
  }
  // tslint:disable-next-line: no-any
} as any) as Context;

const cosmosDbName = getRequiredStringEnv("COSMOSDB_NAME");
const database = cosmosdbClient.database(cosmosDbName);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

// tslint:disable-next-line: max-union-size
async function run(): Promise<any> {
  const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
    throw new Error(`Invalid input: ${readableReport(reason)}`);
  });

  const errorOrMaybeRetrievedUserDataProcessing = await userDataProcessingModel
    .findLastVersionByModelId(
      makeUserDataProcessingId(
        UserDataProcessingChoiceEnum.DOWNLOAD,
        fiscalCode
      ),
      fiscalCode
    )
    .run();

  if (isLeft(errorOrMaybeRetrievedUserDataProcessing)) {
    throw new Error(
      `Cannot retrieve user data processing ${errorOrMaybeRetrievedUserDataProcessing.value.kind}`
    );
  }

  const maybeUserDataProcessing = errorOrMaybeRetrievedUserDataProcessing.value;

  if (isNone(maybeUserDataProcessing)) {
    throw new Error("Cannot retrieve user data processing.");
  }

  const currentUserDataProcessing = maybeUserDataProcessing.value;

  console.log(
    "Found user data processing request (v=%d) with status %s",
    currentUserDataProcessing.version,
    currentUserDataProcessing.status
  );

  if (
    currentUserDataProcessing.status !== UserDataProcessingStatusEnum.PENDING &&
    currentUserDataProcessing.status !== UserDataProcessingStatusEnum.FAILED
  ) {
    throw new Error("User data processing status !== PENDING & != FAILED");
  }

  return setUserDataProcessingStatusActivity(context, {
    currentRecord: currentUserDataProcessing,
    nextStatus: UserDataProcessingStatusEnum.WIP
  })
    .then(userData => {
      if (userData.kind === "SUCCESS") {
        return extractUserDataActivity(context, {
          fiscalCode
        });
      } else {
        throw new Error(userData.kind);
      }
    })
    .then(bundle => {
      if (bundle.kind === "SUCCESS") {
        return sendUserDataDownloadMessageActivity(context, {
          blobName: bundle.value.blobName,
          fiscalCode: currentUserDataProcessing.fiscalCode,
          password: bundle.value.password
        });
      } else {
        throw new Error(toString(bundle));
      }
    })
    .then(() =>
      setUserDataProcessingStatusActivity(context, {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    )
    .catch(err => {
      console.error(err);
      return setUserDataProcessingStatusActivity(context, {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.FAILED
      });
    });
}

run()
  .then(result => console.log("OK", result))
  .catch(ex => console.error("KO", ex));
