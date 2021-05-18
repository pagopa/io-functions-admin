import {
  IOrchestrationFunctionContext
} from "durable-functions/lib/src/classes";

export const handler = function*(
  context: IOrchestrationFunctionContext
): Generator<unknown> {
  const document = context.df.getInput();
};
