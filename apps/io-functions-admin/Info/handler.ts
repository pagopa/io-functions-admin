import {
  checkApplicationHealth,
  checkAzureCosmosDbHealth,
  checkAzureStorageHealth,
  checkUrlHealth,
  HealthCheck
} from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import * as packageJson from "../package.json";
import { envConfig, IConfig } from "../utils/config";

type HealthChecker = (config: unknown) => HealthCheck<ProblemSource, true>;

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseErrorInternal | IResponseSuccessJson<IInfo>
>;
type ProblemSource = "AzureCosmosDB" | "AzureStorage" | "Config" | "Url";

export function Info(): express.RequestHandler {
  return pipe(
    checkApplicationHealth(IConfig, [
      (config: IConfig): HealthCheck<"AzureCosmosDB", true> =>
        checkAzureCosmosDbHealth(config.COSMOSDB_URI, config.COSMOSDB_KEY),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkAzureStorageHealth(config.StorageConnection),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkAzureStorageHealth(config.UserDataBackupStorageConnection),
      (config: IConfig): HealthCheck<"AzureStorage", true> =>
        checkAzureStorageHealth(config.UserDataArchiveStorageConnection),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.PUBLIC_API_URL),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.SESSION_MANAGER_INTERNAL_API_URL),
      (config: IConfig): HealthCheck<"Url", true> =>
        checkUrlHealth(config.LOGOS_URL)
    ]),
    InfoHandler,
    wrapRequestHandler
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
