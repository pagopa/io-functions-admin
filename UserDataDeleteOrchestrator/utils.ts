import { FiscalCode } from "italia-ts-commons/lib/strings";
import { Day, Hour } from "italia-ts-commons/lib/units";

export const ABORT_EVENT = "user-data-processing-delete-abort";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `${fiscalCode}-USER-DATA-DELETE`;

const aHourInMilliseconds = 60 * 60 * 1000;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const addHours = (now: Date, hours: Hour) =>
  new Date(now.getTime() + hours * aHourInMilliseconds);

const aDayInMilliseconds = 24 * aHourInMilliseconds;
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const addDays = (now: Date, days: Day) =>
  new Date(now.getTime() + days * aDayInMilliseconds);
