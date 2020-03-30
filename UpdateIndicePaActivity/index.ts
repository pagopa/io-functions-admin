import { AzureFunction, Context } from "@azure/functions";

const activityFunction: AzureFunction = async (
  context: Context,
  indicePaUrl: string
): Promise<string> => {
  context.log("indicePaUrl: ", indicePaUrl);
  context.log("context.bindings.indicePaUrl: ", context.bindings.indicePaUrl);
  return "FINISHED";
};

export default activityFunction;
