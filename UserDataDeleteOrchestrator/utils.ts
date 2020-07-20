import { FiscalCode } from "italia-ts-commons/lib/strings";

export const ABORT_EVENT = "user-data-processing-delete-abort";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `user-data-delete-${fiscalCode}`;
