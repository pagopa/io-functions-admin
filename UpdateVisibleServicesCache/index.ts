/**
 * This time triggered function creates a cache for visible services:
 *
 * - read the cached visible-service.json (input binding)
 * - create a version of services/visible-services.json suitable to be consumed by the mobile APP
 * - put the generated JSON into the assets storage (which is reachable behind the CDN)
 * - loop on visible services and store services/<serviceid>.json (output binding)
 *
 * The tuple stored is (serviceId, version, scope).
 *
 * TODO: delete blobs for services that aren't visible anymore.
 */
import { Context } from "@azure/functions";

import { isLeft } from "fp-ts/lib/Either";
import * as S from "fp-ts/lib/string";
import * as RM from "fp-ts/lib/ReadonlyMap";
import { VisibleService } from "@pagopa/io-functions-commons/dist/src/models/visible_service";

import * as df from "durable-functions";
import * as t from "io-ts";
import { pipe } from "fp-ts/lib/function";

export type VisibleServices = t.TypeOf<typeof VisibleServices>;
export const VisibleServices = t.record(t.string, VisibleService);

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
async function UpdateVisibleServiceCache(context: Context): Promise<void> {
  const errorOrVisibleServices = VisibleServices.decode(
    context.bindings.visibleServicesBlob
  );

  if (isLeft(errorOrVisibleServices)) {
    context.log.info(
      "UpdateVisibleServiceCache|Cannot decode visible services"
    );
    return;
  }

  const visibleServiceJson = errorOrVisibleServices.right;
  const visibleServices = RM.fromMap(
    new Map(Object.entries(visibleServiceJson))
  );

  const visibleServicesTuples = pipe(
    visibleServices,
    RM.map(v => ({
      scope: v.serviceMetadata ? v.serviceMetadata.scope : undefined,
      service_id: v.serviceId,
      version: v.version
    }))
  );

  // store visible services in the blob
  // eslint-disable-next-line functional/immutable-data
  context.bindings.visibleServicesCacheBlob = {
    items: pipe(
      visibleServicesTuples,
      RM.reduce(S.Ord)([], (p, c) => [...p, c])
    )
  };

  const { left: NATIONAL, right: LOCAL } = pipe(
    visibleServices,
    RM.partition(s => s.serviceMetadata && s.serviceMetadata.scope === "LOCAL")
  );

  // store visible services partitioned by scope
  // eslint-disable-next-line functional/immutable-data
  context.bindings.visibleServicesByScopeCacheBlob = {
    LOCAL: pipe(
      LOCAL,
      RM.map(_ => _.serviceId),
      RM.reduce(S.Ord)([], (p, c) => [...p, c])
    ),
    NATIONAL: pipe(
      NATIONAL,
      RM.map(_ => _.serviceId),
      RM.reduce(S.Ord)([], (p, c) => [...p, c])
    )
  };

  // start orchestrator to loop on every visible service
  // and to store it in a blob
  await df
    .getClient(context)
    .startNew(
      "UpdateVisibleServicesCacheOrchestrator",
      undefined,
      visibleServiceJson
    );
}

export { UpdateVisibleServiceCache as index };
