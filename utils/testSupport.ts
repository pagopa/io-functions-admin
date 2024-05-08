/* eslint-disable functional/prefer-readonly-type */
/* eslint-disable sonarjs/no-identical-functions */
/* eslint-disable sort-keys */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable functional/no-let */
// eslint-disable @typescript-eslint/no-explicit-any

export const ReadonlyArrayToAsyncIterable = <T>(
  array: ReadonlyArray<T>
): AsyncIterator<T> => {
  let index = 0;
  return {
    next(): Promise<IteratorResult<T>> {
      if (index < array.length) {
        // eslint-disable-next-line no-console
        console.log(`Returning value at index ${index}`);
        return Promise.resolve({ value: array[index++], done: false });
      } else {
        return Promise.resolve({ value: undefined, done: true });
      }
    }
  };
};

export const ReadonlyArrayToAsyncIterableG = <T>(array: ReadonlyArray<T>) =>
  (async function*() {
    let index = 0;
    while (index < array.length) {
      yield array[index++];
    }
  })();

export const ArrayToAsyncIterable = <T>(array: T[]): AsyncIterator<T> => {
  let index = 0;
  return {
    next(): Promise<IteratorResult<T>> {
      if (index < array.length) {
        return Promise.resolve({ value: array[index++], done: false });
      } else {
        return Promise.resolve({ value: undefined, done: true });
      }
    }
  };
};
