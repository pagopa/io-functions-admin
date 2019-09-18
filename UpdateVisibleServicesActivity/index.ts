import { AzureFunction, Context } from "@azure/functions";
import { createBlobService } from "azure-storage";

import * as t from "io-ts";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { isSome, none, Option, some } from "fp-ts/lib/Option";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { ServiceId } from "io-functions-commons/dist/generated/definitions/ServiceId";
import {
  VISIBLE_SERVICE_BLOB_ID,
  VISIBLE_SERVICE_CONTAINER,
  VisibleService
} from "io-functions-commons/dist/src/models/visible_service";
import {
  acquireLease,
  getBlobAsObject,
  releaseLease,
  upsertBlobFromObject
} from "io-functions-commons/dist/src/utils/azure_storage";
import { getRequiredStringEnv } from "io-functions-commons/dist/src/utils/env";
import { Second } from "italia-ts-commons/lib/units";

// The lease duration in seconds.
// After the retrive/update activities the lease is released actively by the function.
// If the function crashes the lease is released by the system.
const LEASE_DURATION = 15 as Second;

const AddVisibleServiceInput = t.interface({
  action: t.literal("UPSERT"),
  visibleService: VisibleService
});

const RemoveVisibleServiceInput = t.interface({
  action: t.literal("DELETE"),
  visibleService: VisibleService
});

const Input = t.union([AddVisibleServiceInput, RemoveVisibleServiceInput]);

export type Input = t.TypeOf<typeof Input>;

interface IVisibleServices {
  [key: string]: VisibleService;
}

const storageConnectionString = getRequiredStringEnv("BlobStorageConnection");
const blobService = createBlobService(storageConnectionString);

/**
 * Create new visibleServices
 * @param visibleServices The current visibleServices
 * @param visibleService The visible service to add/remove
 * @param action The UPSERT/DELETE action
 */
function computeNewVisibleServices(
  visibleServices: IVisibleServices,
  visibleService: VisibleService,
  action: Input["action"]
): Option<IVisibleServices> {
  // Get the current visible service if available
  const currentVisibleService = visibleServices[visibleService.serviceId];
  if (
    currentVisibleService !== undefined &&
    currentVisibleService.version >= visibleService.version
  ) {
    // A newer version is already stored in the blob, so skip the remove/update
    return none;
  }
  if (action === "DELETE") {
    const {
      [visibleService.serviceId]: deletedVisibleService,
      ...restVisibleServices
    } = visibleServices;

    return some(restVisibleServices);
  }

  return some({
    ...visibleServices,
    [visibleService.serviceId]: visibleService
  });
}

/**
 * Update visibleServices blob adding/removing the visible service.
 * Return an error on failure.
 */
async function updateVisibleServices(
  visibleService: VisibleService,
  action: Input["action"],
  leaseId
): Promise<Either<Error, true>> {
  // Retrieve the current visibleServices blob using the leaseId
  const errorOrMaybeVisibleServices = await getBlobAsObject(
    t.dictionary(ServiceId, VisibleService),
    blobService,
    VISIBLE_SERVICE_CONTAINER,
    VISIBLE_SERVICE_BLOB_ID,
    {
      leaseId
    }
  );

  // Map None to empty object
  const errorOrVisibleServices = errorOrMaybeVisibleServices.map(_ =>
    _.getOrElse({})
  );

  if (isLeft(errorOrVisibleServices)) {
    return left(
      Error(
        `UpdateVisibleServicesActivity|Cannot decode blob|ERROR=${errorOrVisibleServices.value}`
      )
    );
  }

  // Compute the new visibleServices blob content
  const maybeNewVisibleServices = computeNewVisibleServices(
    errorOrVisibleServices.value,
    visibleService,
    action
  );

  if (isSome(maybeNewVisibleServices)) {
    const newVisibleServices = maybeNewVisibleServices.value;
    // Store the new visibleServices blob
    const errorOrBlobResult = await upsertBlobFromObject(
      blobService,
      VISIBLE_SERVICE_CONTAINER,
      VISIBLE_SERVICE_BLOB_ID,
      newVisibleServices,
      {
        leaseId
      }
    );

    if (isLeft(errorOrBlobResult)) {
      return left(
        Error(
          `UpdateVisibleServicesActivity|Cannot save blob|ERROR=${errorOrBlobResult.value.message}`
        )
      );
    }
  }

  return right(true);
}

const activityFunction: AzureFunction = async (
  context: Context,
  rawInput: unknown
): Promise<string> => {
  const errorOrInput = Input.decode(rawInput);

  if (isLeft(errorOrInput)) {
    context.log.error(
      `UpdateVisibleServicesActivity|Cannot parse input|ERROR=${readableReport(
        errorOrInput.value
      )}`
    );
    return "FAILURE";
  }

  const { action, visibleService } = errorOrInput.value;

  // Lock the blob to avoid concurrency problems
  const errorOrLeaseResult = await acquireLease(
    blobService,
    VISIBLE_SERVICE_CONTAINER,
    VISIBLE_SERVICE_BLOB_ID,
    {
      leaseDuration: LEASE_DURATION
    }
  );

  if (isLeft(errorOrLeaseResult)) {
    // We got an error locking the blob
    context.log.error(
      `UpdateVisibleServicesActivity|Cannot acquire the lease on the blob|ERROR=${errorOrLeaseResult.value}`
    );
    return "FAILURE";
  }

  const leaseResult = errorOrLeaseResult.value;

  const errorOrOk = await updateVisibleServices(
    visibleService,
    action,
    leaseResult.id
  );

  // Release the lock
  await releaseLease(
    blobService,
    VISIBLE_SERVICE_CONTAINER,
    VISIBLE_SERVICE_BLOB_ID,
    leaseResult.id
  );

  if (isLeft(errorOrOk)) {
    context.log.error(errorOrOk.value.message);
    return "FAILURE";
  }

  return "SUCCESS";
};

export default activityFunction;
