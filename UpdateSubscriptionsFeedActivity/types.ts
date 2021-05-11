import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";

/**
 * Input data for this activity function, we need information about the kind
 * of subscription event and the affected user profile.
 */
export type Input = t.TypeOf<typeof ActivityInput>;
export const ActivityInput = t.intersection([
  t.interface({
    // fiscal code of the user affected by this update
    fiscalCode: FiscalCode,
    // whether the service has been subscribed or unsubscribed
    operation: t.union([t.literal("SUBSCRIBED"), t.literal("UNSUBSCRIBED")]),
    // the time (millis epoch) of the update
    updatedAt: t.number,
    // updated version of the profile
    version: t.number
  }),
  t.union([
    t.interface({
      // a profile subscription event
      subscriptionKind: t.literal("PROFILE")
    }),
    t.interface({
      // the updated service
      serviceId: ServiceId,
      // a service subscription event
      subscriptionKind: t.literal("SERVICE")
    })
  ])
]);

export type ActivityResult = t.TypeOf<typeof ActivityResult>;
export const ActivityResult = t.union([
  t.literal("SUCCESS"),
  t.literal("FAILURE")
]);
