/**
 * Given an async operation, it retries the operation until
 * the retry conditions are met and maximum attempts are fulfilled.
 *
 * An optional delay in milliseconds can be waited between attempts.
 *
 * @param operation the operation to be executed
 * @param whileCondition stop retries when false. Default: alway true
 * @param maxAttempts max total calls to operation. Default: 3
 * @param delayMS delay between invocations. Default: 100ms
 * @returns
 */

export const withRetry = ({
  whileCondition = (_: unknown): true => true,
  maxAttempts = 3,
  delayMS = 100
}: {
  readonly whileCondition?: (failure: unknown) => boolean;
  readonly maxAttempts?: number;
  readonly delayMS?: number;
} = {}) => <T>(operation: () => Promise<T>) => async (): Promise<T> => {
  // eslint-disable-next-line functional/no-let
  let remainingAttempts = maxAttempts;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (error) {
      remainingAttempts--;

      if (!remainingAttempts || !whileCondition(error)) {
        throw error;
      }

      if (delayMS) {
        await new Promise(done => setTimeout(done, delayMS));
      }
    }
  }
};
