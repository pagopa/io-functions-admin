/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// eslint-disable no-console, @typescript-eslint/no-explicit-any

import * as dotenv from "dotenv";
dotenv.config();

import { Context } from "@azure/functions";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";

import extractUserDataActivity from "../ExtractUserDataActivity";
import sendUserDataDownloadMessageActivity from "../SendUserDataDownloadMessageActivity";
import setUserDataProcessingStatusActivity from "../SetUserDataProcessingStatusActivity";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";

const config = getConfigOrThrow();

const context = {
  log: {
    error: console.error,

    info: console.log,

    verbose: console.log
  }
} as unknown as Context;

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(): Promise<any> {
  const fiscalCode = pipe(
    process.argv[2],
    FiscalCode.decode,
    E.getOrElseW(reason => {
      throw new Error(`Invalid input: ${readableReport(reason)}`);
    })
  );

  const errorOrMaybeRetrievedUserDataProcessing =
    await userDataProcessingModel.findLastVersionByModelId([
      makeUserDataProcessingId(
        UserDataProcessingChoiceEnum.DOWNLOAD,
        fiscalCode
      ),
      fiscalCode
    ])();

  if (E.isLeft(errorOrMaybeRetrievedUserDataProcessing)) {
    throw new Error(
      `Cannot retrieve user data processing ${errorOrMaybeRetrievedUserDataProcessing.left.kind}`
    );
  }

  const maybeUserDataProcessing = errorOrMaybeRetrievedUserDataProcessing.right;

  if (O.isNone(maybeUserDataProcessing)) {
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
        throw new Error(String(bundle));
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
