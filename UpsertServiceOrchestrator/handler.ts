import * as df from "durable-functions";

import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";

import { isLeft } from "fp-ts/lib/Either";
import { isSome, none, Option, some } from "fp-ts/lib/Option";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";

import { RetrievedService } from "io-functions-commons/dist/src/models/service";

import {
  Input as UpdateVisibleServicesActivityInput,
  Result as UpdateVisibleServicesActivityResult
} from "../UpdateVisibleServicesActivity/handler";
import { retrievedServiceToVisibleService } from "../utils/conversions";
import { UpsertServiceEvent } from "../utils/UpsertServiceEvent";

/**
 * Using the data of new and old service calculate the action to perform to the visible services
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
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

export const handler = function*(
  context: IOrchestrationFunctionContext
): Generator<unknown> {
  const input = context.df.getInput();

  const retryOptions = new df.RetryOptions(5000, 10);
  // eslint-disable-next-line functional/immutable-data
  retryOptions.backoffCoefficient = 1.5;

  // Check if input is valid
  const errorOrUpsertServiceEvent = UpsertServiceEvent.decode(input);

  if (isLeft(errorOrUpsertServiceEvent)) {
    context.log.error(
      `UpdateVisibleServicesActivity|Cannot parse input|ERROR=${readableReport(
        errorOrUpsertServiceEvent.value
      )}`
    );
    // We will never be able to recover from this, so don't trigger a retry
    return [];
  }

  const upsertServiceEvent = errorOrUpsertServiceEvent.value;
  const { newService, oldService } = upsertServiceEvent;

  // Update visible services if needed
  const maybeAction = computeMaybeAction(newService, oldService);
  const visibleService = retrievedServiceToVisibleService(newService);
  if (isSome(maybeAction)) {
    const action = maybeAction.value;
    context.log.verbose(
      `UpdateVisibleServicesActivity|Visible services must be updated|SERVICE_ID=${visibleService.serviceId}|ACTION=${action}`
    );
    const updateVisibleServicesActivityInput = UpdateVisibleServicesActivityInput.encode(
      {
        action,
        visibleService
      }
    );

    try {
      const updateVisibleServicesActivityResultJson = yield context.df.callActivityWithRetry(
        "UpdateVisibleServicesActivity",
        retryOptions,
        updateVisibleServicesActivityInput
      );

      const errorOrUpdateVisibleServicesActivityResult = UpdateVisibleServicesActivityResult.decode(
        updateVisibleServicesActivityResultJson
      );

      if (isLeft(errorOrUpdateVisibleServicesActivityResult)) {
        context.log.error(
          `UpdateVisibleServicesActivity|Can't decode result|SERVICE_ID=${
            visibleService.serviceId
          }|ERROR=${readableReport(
            errorOrUpdateVisibleServicesActivityResult.value
          )}`
        );

        return [];
      }

      const updateVisibleServicesActivityResult =
        errorOrUpdateVisibleServicesActivityResult.value;

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
