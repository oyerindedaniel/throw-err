import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { Result } from "../types/Result";
import { normalizeError } from "../utils/normalizeError";

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
export async function tryCatch<
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
 * Synchronously executes a function and returns a Result
 * @template T The success type
 * @template E The error type
 * @template Args The argument types
 * @param fn The function to execute
 * @param args The arguments to pass to the function
 * @returns A Result containing the success value or error
 * @example
 * ```typescript
 * // For synchronous functions
 * const parseResult = tryCatchSync(
 *   (text) => JSON.parse(text),
 *   '{"name": "John"}'
 * );
 *
 * if (parseResult.success) {
 *   console.log(parseResult.data.name); // "John"
 * } else {
 *   console.error("Parse failed:", parseResult.error.message);
 * }
 * ```
 */
export function tryCatchSync<
  T,
  E extends Error,
  Args extends readonly unknown[]
>(fn: (...args: Args) => T, ...args: Args): Result<T, E> {
  try {
    const data = fn(...args);
    return { success: true, data } as Result<T, never>;
  } catch (err) {
    return {
      success: false,
      error: normalizeError<E>(err),
    } as Result<never, E>;
  }
}
