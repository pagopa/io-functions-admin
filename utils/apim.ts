import { ApiManagementClient } from "@azure/arm-apimanagement";
import {
  GroupContract,
  SubscriptionGetResponse,
  UserGetResponse
} from "@azure/arm-apimanagement/esm/models";
import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { toError } from "fp-ts/lib/Either";
import { flow, identity, pipe } from "fp-ts/lib/function";
import * as t from "io-ts";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/Either";
import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  ResponseErrorInternal,
  ResponseErrorNotFound
} from "@pagopa/ts-commons/lib/responses";
import { parse } from "fp-ts/lib/Json";
import { RestError } from "@azure/ms-rest-js";
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

export const isErrorStatusCode = (
  error: unknown,
  statusCode: number
): boolean => {
  if (error === null) {
    return false;
  }
  if (!(error instanceof RestError)) {
    return false;
  }
  if (!error.statusCode) {
    return false;
  }

  return error.statusCode === statusCode;
};
