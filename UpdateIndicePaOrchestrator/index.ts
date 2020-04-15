/**
 * Orchestrator for the update of administrations from IndicePA: it calls the UpdateIndicePaActivity
 */

import * as df from "durable-functions";
import { Either, isLeft } from "fp-ts/lib/Either";

// tslint:disable-next-line:typedef
const orchestrator = df.orchestrator(function*(context) {
  const errorOrIpaEntries: Either<
    Error,
    ReadonlyArray<Record<string, string>>
  > = yield context.df.callActivity(
    "UpdateIndicePaActivity",
    context.df.getInput()
  );

  if (isLeft(errorOrIpaEntries)) {
    context.log.error(errorOrIpaEntries.value);
    return;
  }

  const ipaEntries = errorOrIpaEntries.value;
  yield context.df.Task.all(
    ipaEntries.map(ipaEntry => {
      const strippedCode = ipaEntry.Cf.replace(/^0+/, "");
      const input = {
        data: ipaEntry,
        fileName: `${strippedCode}.json`,
        subDir: strippedCode.slice(0, 2)
      };
      return context.df.callActivity("UpdateAdministrationActivity", input);
    })
  );
  context.log.info("Update completed");
});

export default orchestrator;
