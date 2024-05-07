import {
  ApiManagementClient,
  GroupContract,
  SubscriptionGetResponse,
  UserGetResponse
} from "@azure/arm-apimanagement";

import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import * as E from "fp-ts/Either";
import { toError } from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { flow, identity, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";

import { AzureAuthorityHosts, ClientSecretCredential } from "@azure/identity";
import { RestError } from "@azure/ms-rest-js";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { parse } from "fp-ts/lib/Json";
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

export type ApimMappedErrors = IResponseErrorInternal | IResponseErrorNotFound;

export const ApimRestError = t.interface({
  statusCode: t.number
});
export type ApimRestError = t.TypeOf<typeof ApimRestError>;

export const mapApimRestError = (resource: string) => (
  apimRestError: ApimRestError
): ApimMappedErrors =>
  apimRestError.statusCode === 404
    ? ResponseErrorNotFound("Not found", `${resource} Not found`)
    : ResponseErrorInternal(
        `Internal Error while retrieving ${resource} detail`
      );

export const chainApimMappedError = <T>(
  te: TE.TaskEither<unknown, T>
): TE.TaskEither<ApimRestError, T> =>
  pipe(
    te,
    TE.orElseW(
      flow(
        JSON.stringify,
        parse,
        E.chainW(ApimRestError.decode),
        E.fold(
          () =>
            TE.left({
              statusCode: 500
            }),
          TE.left
        )
      )
    )
  );

export const getApiClient = (
  servicePrincipalCreds: IServicePrincipalCreds,
  subscriptionId: string
): ApiManagementClient =>
  new ApiManagementClient(
    new ClientSecretCredential(
      servicePrincipalCreds.tenantId,
      servicePrincipalCreds.clientId,
      servicePrincipalCreds.secret,
      {
        authorityHost: AzureAuthorityHosts.AzurePublicCloud
      }
    ),
    subscriptionId
  );

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
export const getUserGroups = (
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TE.TaskEither<ApimRestError, ReadonlyArray<GroupContract>> =>
  pipe(
    TE.tryCatch(async () => {
      const groupListResponse = apimClient.userGroup.list(
        apimResourceGroup,
        apim,
        userName
      );
      // eslint-disable-next-line functional/immutable-data, functional/prefer-readonly-type
      const groupList: GroupContract[] = [];

      for await (const x of groupListResponse) {
        // eslint-disable-next-line functional/immutable-data
        groupList.push(x);
      }
      return groupList;
    }, E.toError),
    chainApimMappedError
  );

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getUser(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userId: string
): TE.TaskEither<ApimRestError, UserGetResponse> {
  return pipe(
    TE.tryCatch(
      () => apimClient.user.get(apimResourceGroup, apim, userId),
      identity
    ),
    chainApimMappedError
  );
}

export const getSubscription = (
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  serviceId: string
): TE.TaskEither<ApimRestError, SubscriptionGetResponse> =>
  pipe(
    TE.tryCatch(
      () => apimClient.subscription.get(apimResourceGroup, apim, serviceId),
      identity
    ),
    chainApimMappedError
  );
/**
 * APIM sdk operations may raise untyped errors.
 * This utility check if the error is of a specific status code
 *
 * @param error any error coming from an APIM sdk call
 * @param statusCode status code to check against
 * @returns whether the returned error is of that status code
 */
export const isErrorStatusCode = (
  error: unknown,
  statusCode: number
): boolean => {
  if (error === null) {
    return false;
  }
  if (
    !(
      error instanceof RestError ||
      (typeof error === "object" && "statusCode" in error)
    )
  ) {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(error as any).statusCode) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (error as any).statusCode === statusCode;
};

/*
 ** The right full path for ownerID is in this kind of format:
 ** "/subscriptions/subid/resourceGroups/{resourceGroup}/providers/Microsoft.ApiManagement/service/{apimService}/users/5931a75ae4bbd512a88c680b",
 ** resouce link: https://docs.microsoft.com/en-us/rest/api/apimanagement/current-ga/subscription/get
 */
export const parseOwnerIdFullPath = (
  fullPath: NonEmptyString
): NonEmptyString =>
  pipe(
    fullPath,
    f => f.split("/"),
    a => a[a.length - 1] as NonEmptyString
  );
