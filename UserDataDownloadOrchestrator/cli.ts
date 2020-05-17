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

import { UserDataProcessingChoiceEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "io-functions-commons/dist/generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  UserDataProcessing
} from "io-functions-commons/dist/src/models/user_data_processing";

const context = ({
  log: {
    info: console.log,
    verbose: console.log
  }
  // tslint:disable-next-line: no-any
} as any) as Context;

// tslint:disable-next-line: max-union-size
async function run(): Promise<any> {
  const fiscalCode = "SPNDNL80R13C523K" as FiscalCode;
  // tslint:disable-next-line: no-commented-code
  // const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
  //   throw new Error(`Invalid input: ${readableReport(reason)}`);
  // });
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
        throw new Error(bundle.kind);
      }
    })
    .then(() =>
      setUserDataProcessingStatusActivity(context, {
        currentRecord: currentUserDataProcessing,
        nextStatus: UserDataProcessingStatusEnum.CLOSED
      })
    )
    .catch(console.error);
}

run()
  .then(result => console.log("OK", result))
  .catch(ex => console.error("KO", ex));
