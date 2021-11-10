import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";

import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  SubscriptionCreateOrUpdateResponse,
  SubscriptionGetResponse,
  UserContract
} from "@azure/arm-apimanagement/esm/models";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { pipe } from "fp-ts/lib/function";

export interface IProxyApimClient {
  readonly getSubscription: GetSubscription;
  readonly getUserByEmail: GetUserByEmail;
  readonly updateSubscriptionOwner: UpdateSupbscriptionOwner;
}

type GetUserByEmail = ReturnType<typeof getUserByEmail>;
const getUserByEmail = (
  apimClient: ApiManagementClient,
  apimResourceGroup: NonEmptyString,
  apimServiceName: NonEmptyString
) => (userEmail: NonEmptyString): TE.TaskEither<Error, UserContract> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.user.listByService(apimResourceGroup, apimServiceName, {
          filter: `email eq '${userEmail}'`
        }),
      x => E.toError(x)
    ),
    TE.chain(
      TE.fromPredicate(
        results => results.length > 0,
        () => new Error("Cannot find user by email")
      )
    ),
    TE.map(_ => _[0])
  );

type GetSubscription = ReturnType<typeof getSubscription>;
const getSubscription = (
  apimClient: ApiManagementClient,
  apimResourceGroup: NonEmptyString,
  apimServiceName: NonEmptyString
) => (subscriptionId: string): TE.TaskEither<Error, SubscriptionGetResponse> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.get(
          apimResourceGroup,
          apimServiceName,
          subscriptionId
        ),
      E.toError
    )
  );

export type UpdateSupbscriptionOwner = ReturnType<
  typeof updateSubscriptionOwner
>;
const updateSubscriptionOwner = (
  apimClient: ApiManagementClient,
  apimResourceGroup: NonEmptyString,
  apimServiceName: NonEmptyString
) => (
  subscription: SubscriptionGetResponse,
  destinationOwnerId: string
): TE.TaskEither<Error, SubscriptionCreateOrUpdateResponse> =>
  pipe(
    TE.tryCatch(
      () =>
        apimClient.subscription.createOrUpdate(
          apimResourceGroup,
          apimServiceName,
          subscription.id,
          {
            displayName: subscription.displayName,
            ownerId: destinationOwnerId,
            scope: subscription.scope
          }
        ),
      E.toError
    )
  );

/**
 *
 * Build a proxy APIM Client with const resourceGroup and serviceName
 */
export const buildApimClient = (
  client: ApiManagementClient,
  apimResourceGroup,
  apimServiceName
): IProxyApimClient => ({
  getSubscription: getSubscription(client, apimResourceGroup, apimServiceName),
  getUserByEmail: getUserByEmail(client, apimResourceGroup, apimServiceName),
  updateSubscriptionOwner: updateSubscriptionOwner(
    client,
    apimResourceGroup,
    apimServiceName
  )
});
