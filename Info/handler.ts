import * as express from "express";
import { wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorInternal,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import {
  checkApplicationHealth,
  checkAzureCosmosDbHealth,
  checkAzureStorageHealth,
  checkUrlHealth,
  HealthCheck
} from "@pagopa/io-functions-commons/dist/src/utils/healthcheck";
import * as packageJson from "../package.json";
import { envConfig, IConfig } from "../utils/config";

interface IInfo {
  readonly name: string;
  readonly version: string;
}

type InfoHandler = () => Promise<
  IResponseSuccessJson<IInfo> | IResponseErrorInternal
>;

type ProblemSource = "AzureCosmosDB" | "AzureStorage" | "Config" | "Url";
type HealthChecker = (config: unknown) => HealthCheck<ProblemSource, true>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function InfoHandler(healthCheck: HealthChecker): InfoHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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
