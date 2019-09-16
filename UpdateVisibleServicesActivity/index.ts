import { AzureFunction, Context } from "@azure/functions";
import { createBlobService } from "azure-storage";

import * as t from "io-ts";

import { isLeft } from "fp-ts/lib/Either";
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
 * @param action The add/remove action
 */
function computeNewVisibleServices(
  visibleServices: IVisibleServices,
  visibleService: VisibleService,
  action: Input["action"]
): Option<IVisibleServices> {
  // Get the current visible service if available
  const currentVisibleService = visibleServices[visibleService.serviceId];
  if (currentVisibleService.version >= visibleService.version) {
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

  const errorOrMaybeVisibleServices = await getBlobAsObject(
    t.dictionary(ServiceId, VisibleService),
    blobService,
    VISIBLE_SERVICE_CONTAINER,
    VISIBLE_SERVICE_BLOB_ID,
    {
      leaseId: leaseResult.id
    }
  );

  // Map None to empty object
  const errorOrVisibleServices = errorOrMaybeVisibleServices.map(_ =>
    _.getOrElse({})
  );

  if (isLeft(errorOrVisibleServices)) {
    context.log.error(
      `UpdateVisibleServicesActivity|Cannot decode blob|ERROR=${errorOrVisibleServices.value}`
    );
    await releaseLease(
      blobService,
      VISIBLE_SERVICE_CONTAINER,
      VISIBLE_SERVICE_BLOB_ID,
      leaseResult.id
    );
    return "FAILURE";
  }

  const maybeNewVisibleServices = computeNewVisibleServices(
    errorOrVisibleServices.value,
    visibleService,
    action
  );

  if (isSome(maybeNewVisibleServices)) {
    const newVisibleServices = maybeNewVisibleServices.value;
    const errorOrBlobResult = await upsertBlobFromObject(
      blobService,
      VISIBLE_SERVICE_CONTAINER,
      VISIBLE_SERVICE_BLOB_ID,
      newVisibleServices
    );

    if (isLeft(errorOrBlobResult)) {
      context.log.error(
        `UpdateVisibleServicesActivity|Cannot save blob|ERROR=${errorOrBlobResult.value.message}`
      );
      return "FAILURE";
    }
  }

  return "SUCCESS";
};

export default activityFunction;
