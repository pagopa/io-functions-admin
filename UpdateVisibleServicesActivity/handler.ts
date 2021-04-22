import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";

import * as t from "io-ts";

import { Either, isLeft, left, right } from "fp-ts/lib/Either";
import { isSome, none, Option, some } from "fp-ts/lib/Option";

import { Second } from "italia-ts-commons/lib/units";

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  VISIBLE_SERVICE_BLOB_ID,
  VISIBLE_SERVICE_CONTAINER,
  VisibleService
} from "@pagopa/io-functions-commons/dist/src/models/visible_service";
import {
  acquireLease,
  getBlobAsObject,
  releaseLease,
  upsertBlobFromObject
} from "@pagopa/io-functions-commons/dist/src/utils/azure_storage";

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

export const Input = t.taggedUnion("action", [
  AddVisibleServiceInput,
  RemoveVisibleServiceInput
]);

export type Input = t.TypeOf<typeof Input>;

const ResultSuccess = t.interface({
  kind: t.literal("SUCCESS")
});

const ResultFailure = t.interface({
  kind: t.literal("FAILURE"),
  reason: t.string
});

export const Result = t.taggedUnion("kind", [ResultSuccess, ResultFailure]);

export type Result = t.TypeOf<typeof Result>;

const VisibleServicesBlob = t.dictionary(ServiceId, VisibleService);

interface IVisibleServices {
  [key: string]: VisibleService;
}

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
  blobService: BlobService,
  visibleService: VisibleService,
  action: Input["action"],
  leaseId: string
): Promise<Either<Error, true>> {
  // Retrieve the current visibleServices blob using the leaseId
  const errorOrMaybeVisibleServices = await getBlobAsObject(
    VisibleServicesBlob,
    blobService,
    VISIBLE_SERVICE_CONTAINER,
    VISIBLE_SERVICE_BLOB_ID,
    {
      leaseId
    }
  );

  // Default to an empty object when the blob does not exist yet
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

/**
 * Returns a function for handling UpdateVisibleServicesActivity
 */
export const getUpdateVisibleServicesActivityHandler = (
  blobService: BlobService
) => async (context: Context, input: unknown): Promise<unknown> => {
  const errorOrInput = Input.decode(input);

  if (isLeft(errorOrInput)) {
    // Return a failure result
    // We don't throw an exception because is not possible to retry
    return Result.encode({
      kind: "FAILURE",
      reason: "Cannot parse input"
    });
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
    // Another instance of this activity has locked the blob we need to retry
    const error = Error(
      `UpdateVisibleServicesActivity|Cannot acquire the lease on the blob|ERROR=${errorOrLeaseResult.value}`
    );
    context.log.error(error.message);
    throw error;
  }

  const leaseResult = errorOrLeaseResult.value;

  const errorOrOk = await updateVisibleServices(
    blobService,
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
    // Throw an error so the activity is retried
    throw errorOrOk.value;
  }

  // Return a success result
  return Result.encode({
    kind: "SUCCESS"
  });
};
