import { AsyncFnWithErr } from "./AsyncFnWithErr";

/**
 * Creates an AsyncFnWithErr instance for a given async function, specifying the error type E
 * @template E The error type that may be thrown
 * @returns A function that wraps the provided async function
 * @example
 * ```typescript
 * const fetchUser = asyncFn<FetchError>()(async (id: string) => {
 *   const response = await fetch(`/api/users/${id}`);
 *   if (!response.ok) throw new FetchError('Failed to fetch user');
 *   return await response.json();
 * });
 * ```
 */
export function asyncFn<E extends Error>() {
  return <T, Args extends readonly unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): AsyncFnWithErr<T, E, Args> => {
    return new AsyncFnWithErr<T, E, Args>(fn);
  };
}
