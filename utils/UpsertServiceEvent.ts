import * as t from "io-ts";

import { RetrievedService } from "io-functions-commons/dist/src/models/service";

/**
 * Carries information about created or updated service.
 *
 * When oldService is defined, the service has been updated, or it has been
 * created otherwise.
 */
export const UpsertServiceEvent = t.intersection([
  t.interface({
    newService: RetrievedService,
    updatedAt: t.number
  }),
  t.partial({
    oldService: RetrievedService
  })
]);

export type UpsertServiceEvent = t.TypeOf<typeof UpsertServiceEvent>;
