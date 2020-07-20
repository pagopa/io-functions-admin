import { IFunctionContext } from "durable-functions/lib/src/classes";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Day, Hour } from "italia-ts-commons/lib/units";

export const ABORT_EVENT = "user-data-processing-delete-abort";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `user-data-delete-${fiscalCode}`;

const aHourInMilliseconds = 60 * 60 * 1000;
export const addHours = (context: IFunctionContext, hours: Hour) =>
  new Date(
    context.df.currentUtcDateTime.getTime() + hours * aHourInMilliseconds
  );

const aDayInMilliseconds = 24 * aHourInMilliseconds;
export const addDays = (context: IFunctionContext, days: Day) =>
  new Date(context.df.currentUtcDateTime.getTime() + days * aDayInMilliseconds);
