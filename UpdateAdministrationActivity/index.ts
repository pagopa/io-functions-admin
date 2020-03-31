import { AzureFunction, Context } from "@azure/functions";

const activityFunction: AzureFunction = async (
  context: Context
): Promise<void> => {
  // tslint:disable-next-line:no-object-mutation
  context.bindings.data = context.bindings.input.data;
};

export default activityFunction;
