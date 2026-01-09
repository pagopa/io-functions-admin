// eslint-disable @typescript-eslint/no-explicit-any

export const ReadonlyArrayToAsyncIterable = <T>(
  array: readonly T[]
): AsyncIterator<T> => {
  let index = 0;
  return {
    next(): Promise<IteratorResult<T>> {
      if (index < array.length) {
        return Promise.resolve({ done: false, value: array[index++] });
      } else {
        return Promise.resolve({ done: true, value: undefined });
      }
    }
  };
};

export const ArrayToAsyncIterable = <T>(array: T[]): AsyncIterator<T> => {
  let index = 0;
  return {
    next(): Promise<IteratorResult<T>> {
      if (index < array.length) {
        return Promise.resolve({ done: false, value: array[index++] });
      } else {
        return Promise.resolve({ done: true, value: undefined });
      }
    }
  };
};
