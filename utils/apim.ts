import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GroupContract } from "@azure/arm-apimanagement/esm/models";
import { GraphRbacManagementClient } from "@azure/graph";
import * as msRestNodeAuth from "@azure/ms-rest-nodeauth";
import { toError } from "fp-ts/lib/Either";
import { TaskEither, tryCatch } from "fp-ts/lib/TaskEither";

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

export function getApiClient(
  servicePrincipalCreds: IServicePrincipalCreds,
  subscriptionId: string
): TaskEither<Error, ApiManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        servicePrincipalCreds.clientId,
        servicePrincipalCreds.secret,
        servicePrincipalCreds.tenantId
      ),
    toError
  ).map(credentials => new ApiManagementClient(credentials, subscriptionId));
}

export function getGraphRbacManagementClient(
  adb2cCreds: IServicePrincipalCreds
): TaskEither<Error, GraphRbacManagementClient> {
  return tryCatch(
    () =>
      msRestNodeAuth.loginWithServicePrincipalSecret(
        adb2cCreds.clientId,
        adb2cCreds.secret,
        adb2cCreds.tenantId,
        { tokenAudience: "graph" }
      ),
    toError
  ).map(
    credentials =>
      new GraphRbacManagementClient(credentials, adb2cCreds.tenantId, {
        baseUri: "https://graph.windows.net"
      })
  );
}

export function getUserGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TaskEither<Error, ReadonlyArray<GroupContract>> {
  return tryCatch(async () => {
    // eslint-disable-next-line functional/prefer-readonly-type, functional/no-let
    const groupList: GroupContract[] = [];
    const groupListResponse = await apimClient.userGroup.list(
      apimResourceGroup,
      apim,
      userName
    );
    groupList.push(...groupListResponse);
    // eslint-disable-next-line functional/no-let
    let nextLink = groupListResponse.nextLink;
    while (nextLink) {
      const nextGroupList = await apimClient.userGroup.listNext(nextLink);
      groupList.push(...nextGroupList);
      nextLink = nextGroupList.nextLink;
    }
    return groupList;
  }, toError);
}
