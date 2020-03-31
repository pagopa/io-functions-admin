import { AzureFunction, Context } from "@azure/functions";
import { createStream } from "csv-stream";
import * as es from "event-stream";
import { Either, toError } from "fp-ts/lib/Either";
import { tryCatch } from "fp-ts/lib/TaskEither";
import fetch from "node-fetch";
import { Stream } from "stream";

function parseAdministrations(
  responseBody: Stream
): Promise<ReadonlyArray<Record<string, string>>> {
  // tslint:disable-next-line:readonly-array
  const administrations: Array<Record<string, string>> = [];
  return new Promise((resolve, reject) =>
    responseBody
      .pipe(
        createStream({
          delimiter: "\t"
        })
      )
      .pipe(
        es.map((entry: Record<string, string>, cb: () => void) => {
          // Check that the info from the current row is valid,
          // if it's not, then do nothing
          if (entry.cf_validato !== "S") {
            // filter out entries without a validated CF
            return cb();
          }

          if (!entry.Cf || entry.Cf.length < 2 || !entry.Cf.match(/^\d+$/)) {
            // filter out entries with bogus CF
            return cb();
          }

          administrations.push(entry);
          cb();
        })
      )
      .on("end", () => resolve(administrations))
      .on("error", reject)
  );
}

const activityFunction: AzureFunction = async (
  context: Context
): Promise<Either<Error, ReadonlyArray<Record<string, string>>>> => {
  return await tryCatch(() => fetch(context.bindings.indicePaUrl), toError)
    .chain(response =>
      tryCatch(() => parseAdministrations(response.body), toError)
    )
    .run();
};

export default activityFunction;
