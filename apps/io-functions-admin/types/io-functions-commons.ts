/**
 * Type definitions for types that are not exported from @pagopa/io-functions-commons
 * but are needed for TypeScript compilation in strict mode
 */

import { WithinRangeInteger } from "@pagopa/ts-commons/lib/numbers";

// Workaround for INotificationStatusIdTag not being exported
export interface INotificationStatusIdTag {
  readonly kind: "INotificationStatusIdTag";
}

export type NotificationStatusId = INotificationStatusIdTag &
  WithinRangeInteger<0, 100>;

// Re-export commonly needed types

export type { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
