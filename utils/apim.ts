import { ApiManagementClient } from "@azure/arm-apimanagement";
import { GroupContract } from "@azure/arm-apimanagement/esm/models";
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

export function getUserGroups(
  apimClient: ApiManagementClient,
  apimResourceGroup: string,
  apim: string,
  userName: string
): TaskEither<Error, ReadonlyArray<GroupContract>> {
  return tryCatch(async () => {
    // tslint:disable-next-line:readonly-array no-let
    const groupList: GroupContract[] = [];
    const groupListResponse = await apimClient.userGroup.list(
      apimResourceGroup,
      apim,
      userName
    );
    groupList.push(...groupListResponse);
    // tslint:disable-next-line:no-let
    let nextLink = groupListResponse.nextLink;
    while (nextLink) {
      const nextGroupList = await apimClient.userGroup.listNext(nextLink);
      groupList.push(...nextGroupList);
      nextLink = nextGroupList.nextLink;
    }
    return groupList;
  }, toError);
}
