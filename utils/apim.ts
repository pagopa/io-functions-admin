import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  GroupContract,
  SubscriptionGetResponse
} from "@azure/arm-apimanagement/esm/models";
import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import {
  ResponseErrorNotFound,
  ResponseErrorInternal,
  IResponseErrorInternal,
  IResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";

export interface IServicePrincipalCreds {
  readonly clientId: string;
  readonly secret: string;
  readonly tenantId: string;
}

export interface IAzureApimConfig {
  readonly subscriptionId: string;
  readonly apimResourceGroup: string;
  readonly apim: string;
}

interface IRestError {
  readonly statusCode: number;
  readonly message?: string;
}

const isRestError = (i: unknown): i is IRestError =>
  typeof i === "object" && "statusCode" in i;

export type IApimErrors = IResponseErrorInternal | IResponseErrorNotFound;

export const mapRestErrorWithIResponse = (e: Error): IApimErrors =>
  isRestError(e) && e.statusCode === 404
    ? ResponseErrorNotFound("Not Found", e.message)
    : ResponseErrorInternal(e.message);

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getApiClient(
  servicePrincipalCreds: IServicePrincipalCreds,
  subscriptionId: string
): TE.TaskEither<Error, ApiManagementClient> {
  return pipe(
    TE.tryCatch(
      () =>
        msRestNodeAuth.loginWithServicePrincipalSecret(
          servicePrincipalCreds.clientId,
          servicePrincipalCreds.secret,
          servicePrincipalCreds.tenantId
        ),
      toError
    ),
    TE.map(credentials => new ApiManagementClient(credentials, subscriptionId))
  );
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getGraphRbacManagementClient(
  adb2cCreds: IServicePrincipalCreds
): TE.TaskEither<Error, GraphRbacManagementClient> {
  return pipe(
    TE.tryCatch(
      () =>
        msRestNodeAuth.loginWithServicePrincipalSecret(
          adb2cCreds.clientId,
          adb2cCreds.secret,
          adb2cCreds.tenantId,
          { tokenAudience: "graph" }
        ),
      toError
    ),
    TE.map(
      credentials =>
        new GraphRbacManagementClient(credentials, adb2cCreds.tenantId, {
          baseUri: "https://graph.windows.net"
        })
    )
  );
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getUserGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TE.TaskEither<Error, ReadonlyArray<GroupContract>> {
  return pipe(
    TE.tryCatch(async () => {
      // eslint-disable-next-line functional/prefer-readonly-type, functional/no-let
      const groupList: GroupContract[] = [];
      const groupListResponse = await apimClient.userGroup.list(
        apimResourceGroup,
        apim,
        userName
      );
      // eslint-disable-next-line functional/immutable-data
      groupList.push(...groupListResponse);
      // eslint-disable-next-line functional/no-let
      let nextLink = groupListResponse.nextLink;
      while (nextLink) {
        const nextGroupList = await apimClient.userGroup.listNext(nextLink);
        // eslint-disable-next-line functional/immutable-data
        groupList.push(...nextGroupList);
        nextLink = nextGroupList.nextLink;
      }
      return groupList;
    }, toError)
  );
}

export const getSubscription = (
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  serviceId: string
): TE.TaskEither<Error, SubscriptionGetResponse> =>
  pipe(
    serviceId,
    TE.right,
    TE.chain(sid =>
      TE.tryCatch(
        () => apimClient.subscription.get(apimResourceGroup, apim, sid),
        E.toError
      )
    )
  );

export const wrapWithIResponse = <T>(
  fa: TE.TaskEither<Error, T>
): TE.TaskEither<IApimErrors, T> =>
  pipe(fa, TE.mapLeft(mapRestErrorWithIResponse));

export const extractUserId = (
  subscription: SubscriptionGetResponse
): O.Option<string> =>
  pipe(
    subscription.ownerId,
    O.fromNullable,
    O.map(str => str.substring(7)) // {userId} will be extracted from /users/{userId}
  );
