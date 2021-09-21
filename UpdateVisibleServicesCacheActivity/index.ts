/**
 * Take service json as input and store the JSON into
 * services/<serviceid>.json through output binding.
 */
import { Context } from "@azure/functions";
import * as E from "fp-ts/lib/Either";
import {
  toServicePublic,
  VisibleService
} from "@pagopa/io-functions-commons/dist/src/models/visible_service";

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
async function UpdateVisibleServiceCacheActivity(
  context: Context
): Promise<void> {
  const visibleServiceJson = context.bindings.visibleServiceJson;
  const errorOrVisibleService = VisibleService.decode(visibleServiceJson);

  if (E.isLeft(errorOrVisibleService)) {
    context.log.error(
      "UpdateVisibleServiceCacheActivity|Cannot decode visible service JSON"
    );
    return;
  }
  const visibleService = errorOrVisibleService.right;

  context.log.info(
    "UpdateVisibleServiceCacheActivity|SERVICE_ID=",
    visibleService.serviceId
  );
  // we don't want to pollute the table storage
  // (where the activity result is saved),
  // so we return void from this method and
  // use context bindings
  // eslint-disable-next-line functional/immutable-data
  context.bindings.visibleServiceCacheBlob = toServicePublic(visibleService);
}

export default UpdateVisibleServiceCacheActivity;
