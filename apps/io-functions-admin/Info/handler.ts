import type { BlobServiceClient } from "@azure/storage-blob";

import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import {
  checkApplicationHealth,
  checkUrlHealth,
  HealthCheck,
  toHealthProblems
} from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import * as packageJson from "../package.json";
import { envConfig, IConfig } from "../utils/config";
import { cosmosdbClient } from "../utils/cosmosdb";

interface BlobHealthClients {
  readonly assets: BlobServiceClient;
  readonly messageContent: BlobServiceClient;
  readonly userDataArchive: BlobServiceClient;
  readonly userDataBackup: BlobServiceClient;
}

type HealthChecker = (config: unknown) => HealthCheck<ProblemSource, true>;

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseErrorInternal | IResponseSuccessJson<IInfo>
>;

type ProblemSource = "AzureCosmosDB" | "AzureStorage" | "Config" | "Url";

interface ReadableBlobContainer {
  getProperties: () => Promise<unknown>;
}

interface ReadableCosmosDatabase {
  read: () => Promise<unknown>;
}

export const checkCosmosDbHealth = (
  getDatabase: () => ReadableCosmosDatabase
): HealthCheck<"AzureCosmosDB", true> =>
  TE.tryCatch(async () => {
    const database = getDatabase();
    await database.read();
    return true as const;
  }, toHealthProblems("AzureCosmosDB"));

export const checkBlobStorageHealth = (
  getContainer: () => ReadableBlobContainer
): HealthCheck<"AzureStorage", true> =>
  TE.tryCatch(async () => {
    await getContainer().getProperties();
    return true as const;
  }, toHealthProblems("AzureStorage"));

export function Info(blobClients: BlobHealthClients) {
  return pipe(
    checkApplicationHealth(IConfig, [
      (config: IConfig): HealthCheck<"AzureCosmosDB", true> =>
        checkCosmosDbHealth(() =>
          cosmosdbClient.database(config.COSMOSDB_NAME)
        ),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkBlobStorageHealth(() =>
          blobClients.messageContent.getContainerClient(
            config.MESSAGE_CONTAINER_NAME
          )
        ),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkBlobStorageHealth(() =>
          blobClients.userDataBackup.getContainerClient(
            config.USER_DATA_BACKUP_CONTAINER_NAME
          )
        ),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkBlobStorageHealth(() =>
          blobClients.userDataArchive.getContainerClient(
            config.USER_DATA_CONTAINER_NAME
          )
        ),
      (): HealthCheck<"AzureStorage", true> =>
        checkBlobStorageHealth(() =>
          blobClients.assets.getContainerClient("services")
        ),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.PUBLIC_API_URL),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.SESSION_MANAGER_INTERNAL_API_URL),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.LOGOS_URL)
    ]),
    InfoHandler,
    handler => wrapHandlerV4([], handler)
  );
}

export function InfoHandler(healthCheck: HealthChecker): InfoHandler {
  return () =>
    pipe(
      envConfig,
      healthCheck,
      TE.mapLeft(problems => ResponseErrorInternal(problems.join("\n\n"))),
      TE.map(_ =>
        ResponseSuccessJson({
          name: packageJson.name,
          version: packageJson.version
        })
      ),
      TE.toUnion
    )();
}
