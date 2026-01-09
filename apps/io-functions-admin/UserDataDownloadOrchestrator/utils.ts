import { FiscalCode } from "@pagopa/ts-commons/lib/strings";

export const makeOrchestratorId = (fiscalCode: FiscalCode): string =>
  `${fiscalCode}-USER-DATA-DOWNLOAD`;
