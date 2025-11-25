import { RetrievedService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { VisibleService } from "@pagopa/io-functions-commons/dist/src/models/visible_service";
import { UTCISODateFromString } from "@pagopa/ts-commons/lib/dates";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as df from "durable-functions";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
import * as E from "fp-ts/lib/Either";
import { isSome, none, Option, some } from "fp-ts/lib/Option";
import * as t from "io-ts";

import {
  Input as UpdateVisibleServicesActivityInput,
  Result as UpdateVisibleServicesActivityResult
} from "../UpdateVisibleServicesActivity/handler";

export function retrievedServiceToVisibleService(
  retrievedService: RetrievedService
): VisibleService {
  const {
    departmentName,
    id,
    organizationFiscalCode,
    organizationName,
    requireSecureChannels,
    serviceId,
    serviceMetadata,
    serviceName,
    version
  } = retrievedService;
  return {
    departmentName,
    id,
    organizationFiscalCode,
    organizationName,
    requireSecureChannels,
    serviceId,
    serviceMetadata,
    serviceName,
    version
  };
}

/**
 * Carries information about created or updated service.
 *
 * When oldService is defined, the service has been updated, or it has been
 * created otherwise.
 */
export const UpsertServiceEvent: t.IntersectionType<
  [
    t.InterfaceType<{
      newService: typeof RetrievedService;
      updatedAt: typeof UTCISODateFromString;
    }>,
    t.PartialType<{
      oldService: typeof RetrievedService;
    }>
  ]
> = t.intersection([
  t.interface({
    newService: RetrievedService,
    updatedAt: UTCISODateFromString
  }),
  t.partial({
    oldService: RetrievedService
  })
]);

export type UpsertServiceEvent = t.TypeOf<typeof UpsertServiceEvent>;

/**
 * Using the data of new and old service calculate the action to perform to the visible services
 */

function computeMaybeAction(
  newService: RetrievedService,
  oldService?: RetrievedService
): Option<UpdateVisibleServicesActivityInput["action"]> {
  if (oldService === undefined) {
    // A service has been created
    return newService.isVisible ? some("UPSERT") : none;
  }

  // A service has been update

  // Visibility not changed
  if (oldService.isVisible === newService.isVisible) {
    return newService.isVisible ? some("UPSERT") : none;
  }

  // Visibility changed
  // If the old service was NOT visible and the new service IS visible return UPSERT, return DELETE otherwise
  return !oldService.isVisible && newService.isVisible
    ? some("UPSERT")
    : some("DELETE");
}

export const handler = function* (
  context: IOrchestrationFunctionContext
): Generator<unknown> {
  const input = context.df.getInput();

  const retryOptions = new df.RetryOptions(5000, 10);
  // eslint-disable-next-line functional/immutable-data
  retryOptions.backoffCoefficient = 1.5;

  // Check if input is valid
  const errorOrUpsertServiceEvent = UpsertServiceEvent.decode(input);

  if (E.isLeft(errorOrUpsertServiceEvent)) {
    context.log.error(
      `UpdateVisibleServicesActivity|Cannot parse input|ERROR=${readableReport(
        errorOrUpsertServiceEvent.left
      )}`
    );
    // We will never be able to recover from this, so don't trigger a retry
    return [];
  }

  const upsertServiceEvent = errorOrUpsertServiceEvent.right;
  const { newService, oldService } = upsertServiceEvent;

  // Update visible services if needed
  const maybeAction = computeMaybeAction(newService, oldService);
  const visibleService = retrievedServiceToVisibleService(newService);
  if (isSome(maybeAction)) {
    const action = maybeAction.value;
    context.log.verbose(
      `UpdateVisibleServicesActivity|Visible services must be updated|SERVICE_ID=${visibleService.serviceId}|ACTION=${action}`
    );
    const updateVisibleServicesActivityInput =
      UpdateVisibleServicesActivityInput.encode({
        action,
        visibleService
      });

    try {
      const updateVisibleServicesActivityResultJson =
        yield context.df.callActivityWithRetry(
          "UpdateVisibleServicesActivity",
          retryOptions,
          updateVisibleServicesActivityInput
        );

      const errorOrUpdateVisibleServicesActivityResult =
        UpdateVisibleServicesActivityResult.decode(
          updateVisibleServicesActivityResultJson
        );

      if (E.isLeft(errorOrUpdateVisibleServicesActivityResult)) {
        context.log.error(
          `UpdateVisibleServicesActivity|Can't decode result|SERVICE_ID=${
            visibleService.serviceId
          }|ERROR=${readableReport(
            errorOrUpdateVisibleServicesActivityResult.left
          )}`
        );

        return [];
      }

      const updateVisibleServicesActivityResult =
        errorOrUpdateVisibleServicesActivityResult.right;

      if (updateVisibleServicesActivityResult.kind === "SUCCESS") {
        context.log.verbose(
          `UpdateVisibleServicesActivity|Update success|SERVICE_ID=${visibleService.serviceId}|ACTION=${action}`
        );
      } else {
        context.log.error(
          `UpdateVisibleServicesActivity|Activity failure|SERVICE_ID=${visibleService.serviceId}|ERROR=${updateVisibleServicesActivityResult.reason}`
        );
      }
    } catch (e) {
      context.log.error(
        `UpdateVisibleServicesActivity|Max retry exceeded|SERVICE_ID=${visibleService.serviceId}|ERROR=${e}`
      );
    }
  } else {
    context.log.verbose(
      `UpdateVisibleServicesActivity|No need to update visible services|SERVICE_ID=${visibleService.serviceId}`
    );
  }

  return [];
};
