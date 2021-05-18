import { Context } from "@azure/functions";

export const requestHandler = () => (
    context: Context,
    input: unknown
  ): Promise<void> => {
    return new Promise(()=> void 0);
  };