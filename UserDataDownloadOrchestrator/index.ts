/*
 * This function is not intended to be invoked directly. Instead it will be
 * triggered by an HTTP starter function.
 *
 * Before running this sample, please:
 * - create a Durable activity function (default name is "Hello")
 * - create a Durable HTTP starter function
 * - run 'npm install durable-functions' from the wwwroot folder of your
 *    function app in Kudu
 */

import { IFunctionContext, Task } from "durable-functions/lib/src/classes";

import * as df from "durable-functions";

const orchestrator = df.orchestrator(function*(
  context: IFunctionContext
): IterableIterator<Task> {
  const input = context.df.getInput();
  const xx = yield context.df.callActivity("ExtractUserDataActivity", {
    // tslint:disable-next-line: no-any
    fiscalCode: (input as any).fiscalCode
  });
  context.log.info(JSON.stringify(xx));
});

export default orchestrator;
