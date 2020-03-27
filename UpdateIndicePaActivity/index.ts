import { AzureFunction, Context } from "@azure/functions";

const activityFunction: AzureFunction = async (
  context: Context,
  indicePaUrl: string
): Promise<void> => {
  context.log("indicePaUrl: ", indicePaUrl);
  context.log("context.bindings.indicePaUrl: ", context.bindings.indicePaUrl);
};

export default activityFunction;
