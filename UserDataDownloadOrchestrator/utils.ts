import { FiscalCode } from "italia-ts-commons/lib/strings";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `${fiscalCode}-USER-DATA-DOWNLOAD`;
