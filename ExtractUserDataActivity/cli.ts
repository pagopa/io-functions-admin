/**
 * Esposes ExtractUserDataActivity as a cli command for local usage
 */

// tslint:disable: no-console
import { Context } from "@azure/functions";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import activity from "./index";

const fiscalCode = FiscalCode.decode(process.argv[2]).getOrElseL(reason => {
  throw new Error(`Invalid input: ${readableReport(reason)}`);
});

const context = ({
  log: console
  // tslint:disable-next-line: no-any
} as any) as Context;

activity(context, { fiscalCode })
  .then(result => console.log("OK", result))
  .catch(ex => console.error("KO", ex));
