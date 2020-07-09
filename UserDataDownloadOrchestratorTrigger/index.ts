import { Context } from "@azure/functions";
import * as df from "durable-functions";

export default (context: Context, input: unknown) =>
  df
    .getClient(context)
    .startNew("UserDataDownloadOrchestrator", undefined, input);
