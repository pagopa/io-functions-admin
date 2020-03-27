/**
 * Orchestrator for the update of administrations from IndicePA: it calls the UpdateIndicePaActivity
 */

import * as df from "durable-functions";

// tslint:disable-next-line:typedef
const orchestrator = df.orchestrator(function*(context) {
  yield context.df.callActivity(
    "UpdateIndicePaActivity",
    context.df.getInput()
  );
});

export default orchestrator;
