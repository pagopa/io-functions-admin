import { FiscalCode } from "italia-ts-commons/lib/strings";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `user-data-download-${fiscalCode}`;
