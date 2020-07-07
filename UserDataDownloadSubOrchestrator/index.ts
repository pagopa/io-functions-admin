import * as df from "durable-functions";
import { IFunctionContext } from "durable-functions/lib/src/classes";
import { handler } from "./handler";

const orchestrator = df.orchestrator(function*(
  context: IFunctionContext
): IterableIterator<unknown> {
  yield handler(context, context.df.getInput());
});

export default orchestrator;
