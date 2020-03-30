/**
 * Orchestrator for the update of administrations from IndicePA: it calls the UpdateIndicePaActivity
 */

import * as df from "durable-functions";

// tslint:disable-next-line:typedef
const orchestrator = df.orchestrator(function*(context) {
  const result = yield context.df.callActivity(
    "UpdateIndicePaActivity",
    context.df.getInput()
  );
  context.log("Result:", result);
});

export default orchestrator;
