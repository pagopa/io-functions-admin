import { Context } from "@azure/functions";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { ServicePreference } from "@pagopa/io-functions-commons/dist/src/models/service_preference";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as t from "io-ts";

import { toHash } from "../utils/crypto";
import {
  SubscriptionFeedEntitySelector,
  updateSubscriptionStatus
} from "../utils/subscription_feed";

const CommonInput = t.interface({
  // fiscal code of the user affected by this update
  fiscalCode: FiscalCode,
  // whether the service has been subscribed or unsubscribed
  operation: t.union([t.literal("SUBSCRIBED"), t.literal("UNSUBSCRIBED")]),
  // the time (millis epoch) of the update
  updatedAt: t.number,
  // updated version of the profile
  version: t.number
});
type CommonInput = t.TypeOf<typeof CommonInput>;

const ProfileInput = t.intersection([
  CommonInput,
  t.interface({
    // a profile subscription event
    subscriptionKind: t.literal("PROFILE")
  }),
  t.partial({
    previousPreferences: t.readonlyArray(ServicePreference)
  })
]);
type ProfileInput = t.TypeOf<typeof ProfileInput>;

const ServiceInput = t.intersection([
  CommonInput,
  t.interface({
    // the updated service
    serviceId: ServiceId,
    // a service subscription event
    subscriptionKind: t.literal("SERVICE")
  })
]);
type ServiceInput = t.TypeOf<typeof ServiceInput>;

/**
 * Input data for this activity function, we need information about the kind
 * of subscription event and the affected user profile.
 */
export const Input = t.union([ProfileInput, ServiceInput]);

export type Input = t.TypeOf<typeof Input>;

export const updateSubscriptionFeed = async (
  context: Context,
  rawInput: unknown,
  tableService: TableService,
  subscriptionFeedTableName: NonEmptyString,
  logPrefix = "UpdateServiceSubscriptionFeedActivity"
) => {
  const decodedInputOrError = Input.decode(rawInput);
  if (E.isLeft(decodedInputOrError)) {
    context.log.error(
      `${logPrefix}|Cannot parse input|ERROR=${readableReport(
        decodedInputOrError.left
      )}`
    );
    return "FAILURE";
  }

  const decodedInput = decodedInputOrError.right;

  const { fiscalCode, operation, updatedAt, version } = decodedInput;

  // The date part of the key will be in UTC time zone, with format: YYYY-MM-DD
  const utcTodayPrefix = new Date(updatedAt).toISOString().substring(0, 10);

  // Create a SHA256 hash of the fiscal code
  // see https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm_options
  const fiscalCodeHash = toHash(fiscalCode);

  const updateLogPrefix = `${logPrefix}|PROFILE=${fiscalCode}|OPERATION=${operation}|PROFILE=${fiscalCode}`;

  // Entity keys have the following format
  //
  // Profile subscription events: P-<DATE>-<EVENT>-<HASH>
  // Service subscription events: S-<DATE>-<SERVICE_ID>-<EVENT>-<HASH>
  //
  // Where:
  //
  // * DATE is "YYYY-MM-DD" (UTC)
  // * SERVICE_ID is the service ID that the user subscribed/unsubscribed
  // * EVENT is either "S" for subscription events or "U" for unsubscriptions
  // * HASH is the hex encoded SHA256 hash of the fiscal code
  //
  const sPartitionKey =
    decodedInput.subscriptionKind === "PROFILE"
      ? `P-${utcTodayPrefix}-S`
      : `S-${utcTodayPrefix}-${decodedInput.serviceId}-S`;
  const uPartitionKey =
    decodedInput.subscriptionKind === "PROFILE"
      ? `P-${utcTodayPrefix}-U`
      : `S-${utcTodayPrefix}-${decodedInput.serviceId}-U`;

  const sKey = `${sPartitionKey}-${fiscalCodeHash}`;
  const uKey = `${uPartitionKey}-${fiscalCodeHash}`;

  const otherEntitiesToDelete: readonly SubscriptionFeedEntitySelector[] = pipe(
    decodedInput,
    O.fromPredicate(ProfileInput.is),
    O.chainNullableK(_ => _.previousPreferences),
    O.map(_ =>
      _.reduce((prev, preference) => {
        // TODO: This code could be optimized deleting only the entry based on the current
        // profile status and the effective previous preference inbox value
        const sPreferencePartitionKey = `S-${utcTodayPrefix}-${preference.serviceId}-S`;
        const uPreferencePartitionKey = `S-${utcTodayPrefix}-${preference.serviceId}-U`;
        return [
          ...prev,
          {
            partitionKey: sPreferencePartitionKey,
            rowKey: `${sPreferencePartitionKey}-${fiscalCodeHash}`
          },
          {
            partitionKey: uPreferencePartitionKey,
            rowKey: `${uPreferencePartitionKey}-${fiscalCodeHash}`
          }
        ];
      }, [] as readonly SubscriptionFeedEntitySelector[])
    ),
    O.getOrElseW(() => [])
  );

  const allowInsertIfDeleted = decodedInput.subscriptionKind !== "SERVICE";

  const updateSubscriptionStatusHandler = updateSubscriptionStatus(
    tableService,
    subscriptionFeedTableName
  );

  if (operation === "SUBSCRIBED") {
    // we delete the entry from the unsubscriptions and we add it to the
    // subscriptions
    await updateSubscriptionStatusHandler(
      context,
      updateLogPrefix,
      version,
      {
        partitionKey: uPartitionKey,
        rowKey: uKey
      },
      otherEntitiesToDelete,
      {
        partitionKey: sPartitionKey,
        rowKey: sKey
      },
      allowInsertIfDeleted
    );
  } else {
    // we delete the entry from the subscriptions and we add it to the
    // unsubscriptions
    await updateSubscriptionStatusHandler(
      context,
      updateLogPrefix,
      version,
      {
        partitionKey: sPartitionKey,
        rowKey: sKey
      },
      otherEntitiesToDelete,
      {
        partitionKey: uPartitionKey,
        rowKey: uKey
      },
      allowInsertIfDeleted
    );
  }

  return "SUCCESS";
};
