import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { Result } from "../types/Result";
import { normalizeError } from "../utils/normalizeError";
import { SyncFnWithErr } from "./SyncFnWithErr";

/**
 * Executes a wrapped function and returns a Result
 * @template T The success type
 * @template E The error type
 * @template Args The argument types
 * @param wrappedFn The wrapped async function
 * @param args The arguments to pass to the function
 * @returns A Promise that resolves to a Result
 * @example
 * ```typescript
 * const result = await tryCatch(fetchUser, '123');
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export async function tryCatchAsync<
  T,
  E extends Error,
  Args extends readonly unknown[]
>(wrappedFn: AsyncFnWithErr<T, E, Args>, ...args: Args): Promise<Result<T, E>> {
  try {
    const data = await wrappedFn.fn(...args);
    return { success: true, data } as Result<T, never>;
  } catch (err) {
    return {
      success: false,
      error: normalizeError<E>(err),
    } as Result<never, E>;
  }
}

/**
 * Synchronously executes a wrapped function and returns a Result
 * @template T The success type
 * @template E The error type
 * @template Args The argument types
 * @param wrappedFn The wrapped synchronous function
 * @param args The arguments to pass to the function
 * @returns A Result containing the success value or error
 * @example
 * ```typescript
 * const parseJson = (text: string) => JSON.parse(text);
 * const wrappedParseJson = syncFn<SyntaxError>()(parseJson);
 * const result = tryCatchSync(wrappedParseJson, '{"name": "John"}');
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function tryCatchSync<
  T,
  E extends Error,
  Args extends readonly unknown[]
>(wrappedFn: SyncFnWithErr<T, E, Args>, ...args: Args): Result<T, E> {
  try {
    const data = wrappedFn.fn(...args);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: normalizeError<E>(err) };
  }
}
