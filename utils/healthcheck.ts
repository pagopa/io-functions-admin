import { CosmosClient } from "@azure/cosmos";
import { Either, left, right, toError } from "fp-ts/lib/Either";
import { taskEither, TaskEither, tryCatch } from "fp-ts/lib/TaskEither";
import { createBlobService, common as azurestorageCommon } from "azure-storage";
import { getConfig, IConfig } from "./config";
import { sequenceT } from "fp-ts/lib/Apply";
import { Task } from "fp-ts/lib/Task";

export type HealthProblem = string;
export type HealthCheck<T = true> = TaskEither<HealthProblem[], T>;

// utility to format an unknown error to an arry of HealthProblem
const toHealthProblems = (e: unknown): HealthProblem[] => [toError(e).message];

/**
 * Check application's configuration is correct
 *
 * @returns either true or an array of error messages
 */
export const checkConfigHealth = (): HealthCheck<IConfig> =>
  tryCatch(async () => getConfig(), e => [toError(e).message]);

/**
 * Check the application can connect to an Azure CosmosDb instances
 *
 * @param dbUri uri of the database
 * @param dbUri connection string for the storage
 *
 * @returns either true or an array of error messages
 */
export const checkAzureCosmosDbHealth = (
  dbUri: string,
  dbKey?: string
): HealthCheck<true> =>
  tryCatch(() => {
    const client = new CosmosClient({
      endpoint: dbUri,
      key: dbKey
    });
    return client.getDatabaseAccount();
  }, toHealthProblems).map(_ => true);

/**
 * Check the application can connect to an Azure Storage
 *
 * @param connStr connection string for the storage
 *
 * @returns either true or an array of error messages
 */
export const checkAzureStorageHealth = (connStr: string): HealthCheck =>
  tryCatch(
    () =>
      new Promise<azurestorageCommon.models.ServiceStats>((resolve, reject) =>
        createBlobService(connStr).getServiceStats((err, result) =>
          err ? reject(err) : resolve(result)
        )
      ),
    toHealthProblems
  ).map(_ => true);

/**
 * Check a url is reachable
 *
 * @param url url to connect with
 *
 * @returns either true or an array of error messages
 */
export const checkUrlHealth = (_url: string): HealthCheck =>
  // TODO: implement this check
  taskEither.of(true);

/**
 * Execute all the health checks for the application
 *
 * @returns either true or an array of error messages
 */
export const checkApplicationHealth = (): HealthCheck =>
  checkConfigHealth()
    .chain(config =>
      // TODO: once we upgrade to fp-ts >= 1.19 we can use Validation to collect all errors, not just the first to happen
      sequenceT(taskEither)(
        checkAzureCosmosDbHealth(config.COSMOSDB_URI, config.COSMOSDB_KEY),
        checkAzureStorageHealth(config.StorageConnection),
        checkAzureStorageHealth(config.UserDataBackupStorageConnection),
        checkAzureStorageHealth(config.UserDataArchiveStorageConnection),
        checkUrlHealth(config.PUBLIC_API_URL),
        checkUrlHealth(config.SESSION_API_URL),
        checkUrlHealth(config.LOGOS_URL)
      )
    )
    .map(_ => true);
