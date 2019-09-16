import * as df from "durable-functions";

import { IFunctionContext } from "durable-functions/lib/src/classes";

import { isLeft } from "fp-ts/lib/Either";
import { isSome, none, Option, some } from "fp-ts/lib/Option";

import { readableReport } from "italia-ts-commons/lib/reporters";

import { RetrievedService } from "io-functions-commons/dist/src/models/service";

import { Input as UpdateVisibleServicesActivityInput } from "../UpdateVisibleServicesActivity";
import { retrievedServiceToVisibleService } from "../utils/conversions";
import { UpsertServiceEvent } from "../utils/UpsertServiceEvent";

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

export const handler = function*(
  context: IFunctionContext
): IterableIterator<unknown> {
  const input = context.df.getInput();

  const retryOptions = new df.RetryOptions(1000, 10);
  // tslint:disable-next-line: no-object-mutation
  retryOptions.backoffCoefficient = 2;

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
  if (isSome(maybeAction)) {
    const visibleService = retrievedServiceToVisibleService(newService);
    yield context.df.callActivityWithRetry(
      "UpdateVisibleServicesActivity",
      retryOptions,
      {
        action: maybeAction.value,
        visibleService
      } as UpdateVisibleServicesActivityInput
    );
  }

  return [];
};
