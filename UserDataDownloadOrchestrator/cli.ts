/**
 * Exposes ExtractUserDataActivity as a cli command for local usage
 */

// eslint-disable no-console, @typescript-eslint/no-explicit-any

import * as dotenv from "dotenv";
dotenv.config();

import { Context } from "@azure/functions";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";

import { toString } from "fp-ts/lib/function";

import { UserDataProcessingStatusEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  USER_DATA_PROCESSING_COLLECTION_NAME,
  UserDataProcessingModel
} from "@pagopa/io-functions-commons/dist/src/models/user_data_processing";

import { isLeft } from "fp-ts/lib/Either";
import { isNone } from "fp-ts/lib/Option";
import { UserDataProcessingChoiceEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import setUserDataProcessingStatusActivity from "../SetUserDataProcessingStatusActivity";
import sendUserDataDownloadMessageActivity from "../SendUserDataDownloadMessageActivity";
import extractUserDataActivity from "../ExtractUserDataActivity";
import { getConfigOrThrow } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";

const config = getConfigOrThrow();

const context = ({
  log: {
    // eslint-disable-next-line no-console
    error: console.error,
    // eslint-disable-next-line no-console
    info: console.log,
    // eslint-disable-next-line no-console
    verbose: console.log
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any) as Context;

const database = cosmosdbClient.database(config.COSMOSDB_NAME);

const userDataProcessingModel = new UserDataProcessingModel(
  database.container(USER_DATA_PROCESSING_COLLECTION_NAME)
);

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, @typescript-eslint/no-explicit-any
async function run(): Promise<any> {
  const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
    throw new Error(`Invalid input: ${readableReport(reason)}`);
  });

  const errorOrMaybeRetrievedUserDataProcessing = await userDataProcessingModel
    .findLastVersionByModelId([
      makeUserDataProcessingId(
        UserDataProcessingChoiceEnum.DOWNLOAD,
        fiscalCode
      ),
      fiscalCode
    ])
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

  // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.error(err);
      return setUserDataProcessingStatusActivity(context, {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.FAILED
      });
    });
}

run()
  // eslint-disable-next-line no-console
  .then(result => console.log("OK", result))
  // eslint-disable-next-line no-console
  .catch(ex => console.error("KO", ex));
