import { pipe } from "fp-ts/lib/function";
import { ProcessableUserDataDownload } from "../../../utils/user_data_types";
import * as E from "fp-ts/lib/Either";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";

export const logPrefixDownloadOrch = "UserDataDownloadOrchestrator";
export const ProcessableDownloadDecodeActivity = async (
  document,
  context: any
) =>
  pipe(
    document,
    ProcessableUserDataDownload.decode,
    E.mapLeft(err => {
      // context.log.error(
      //   `${logPrefixDownloadOrch}|WARN|Cannot decode ProcessableUserDataDownload document: ${readableReport(
      //     err
      //   )}`
      // );
      return {
        kind: "INVALID_INPUT",
        reason: readableReport(err)
      };
    })
  );
