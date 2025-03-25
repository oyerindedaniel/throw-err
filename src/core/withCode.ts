import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { asyncFn } from "./asyncFn";
import { ErrorCode } from "./ErrorCode";

/**
 * Decorates a function to attach an error code to any errors it throws
 * @template E The error type
 * @param code The error code to attach
 * @returns A function that wraps the provided async function
 * @example
 * ```typescript
 * const fetchWithCode = withCode<FetchError>('FETCH_ERROR')(
 *   async (url: string) => {
 *     const res = await fetch(url);
 *     if (!res.ok) throw new FetchError('Failed to fetch');
 *     return res.json();
 *   }
 * );
 * ```
 */
export function withCode<E extends Error>(code: ErrorCode) {
  return <T, Args extends readonly unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): AsyncFnWithErr<T, E, Args> => {
    return asyncFn<E>()(async (...args: Args) => {
      try {
        return await fn(...args);
      } catch (err) {
        if (err instanceof Error) {
          (err as E & { code: ErrorCode }).code = code;
        }
        throw err;
      }
    });
  };
}
