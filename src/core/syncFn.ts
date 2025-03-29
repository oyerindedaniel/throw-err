import { SyncFnWithErr } from "./SyncFnWithErr";

/**
 * Creates a SyncFnWithErr instance for a synchronous function, specifying the error type E
 * @template E The error type that may be thrown
 * @returns A function that wraps the provided synchronous function
 * @example
 * const parseJson = syncFn<SyntaxError>()((text: string) => JSON.parse(text));
 */
export function syncFn<E extends Error>() {
  return <T, Args extends readonly unknown[]>(
    fn: (...args: Args) => T
  ): SyncFnWithErr<T, E, Args> => {
    return new SyncFnWithErr<T, E, Args>(fn);
  };
}
