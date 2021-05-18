import { Context } from "@azure/functions";
import {requestHandler} from "./handler"

export const index = async (
    context: Context,
    input: unknown
  ): Promise<void> => {
    const handler = requestHandler();
    return handler(context, input);
  };
  