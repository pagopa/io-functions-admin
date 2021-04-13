import * as t from "io-ts";

import { UTCISODateFromString } from "italia-ts-commons/lib/dates";

import { RetrievedService } from "io-functions-commons/dist/src/models/service";

/**
 * Carries information about created or updated service.
 *
 * When oldService is defined, the service has been updated, or it has been
 * created otherwise.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const UpsertServiceEvent = t.intersection([
  t.interface({
    newService: RetrievedService,
    updatedAt: UTCISODateFromString
  }),
  t.partial({
    oldService: RetrievedService
  })
]);

export type UpsertServiceEvent = t.TypeOf<typeof UpsertServiceEvent>;
