import { AsyncFnWithErr } from "./AsyncFnWithErr";

/**
 * Creates a wrapper function that can modify an async function,
 * adding additional behavior such as retries, logging, or error handling.
 *
 * @template AE - Additional error type introduced by the wrapper.
 * @returns A function that takes an async function (`fn`) and a wrapper (`wrap`),
 *          applies the wrapper, and returns a new wrapped function.
 *
 * @example
 * const withRetry = createWrapper<RetryExhaustedError>()(
 *   new AsyncFnWithErr(async (id: string) => {
 *     // Fetch user logic
 *   }),
 *   (fn) => async (id: string) => {
 *     // Retry logic
 *   }
 * );
 */
export function createWrapper<AE extends Error = never>() {
  return function <T, Args extends readonly unknown[], E extends Error>(
    fn: AsyncFnWithErr<T, E, Args>,
    wrap: (fn: AsyncFnWithErr<T, E, Args>) => AsyncFnWithErr<T, E | AE, Args>
  ): AsyncFnWithErr<T, E | AE, Args> {
    return new AsyncFnWithErr<T, E | AE, Args>(wrap(fn).fn);
  };
}
