import { AsyncFnWithErr } from "../core/AsyncFnWithErr";
import { Result } from "../types/Result";
import { tryCatch } from "../core/tryCatch";
import { CommonErrorCodes } from "../core/ErrorCode";

// ignore this file

/**
 * Custom error for timeouts
 */
export class TimeoutError extends Error {
  public readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
    this.code = CommonErrorCodes.TIMEOUT;

    // This is needed for proper instanceof checks in transpiled ES5 code
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Retries a function on failure
 * @template T The success type
 * @template E The error type
 * @template Args The argument types
 * @param wrappedFn The wrapped async function
 * @param retries The number of retries
 * @param options Additional options for retries
 * @param args The arguments to pass to the function
 * @returns A Promise that resolves to a Result
 * @example
 * ```typescript
 * const retried = await retry(fetchUser, 3, { delay: 1000 }, '123');
 * ```
 */
export async function retry<
  T,
  E extends Error,
  Args extends readonly unknown[]
>(
  wrappedFn: AsyncFnWithErr<T, E, Args>,
  retries: number,
  options: { delay?: number; exponential?: boolean } = {},
  ...args: Args
): Promise<Result<T, E>> {
  const { delay = 0, exponential = false } = options;
  let lastResult: Result<T, E> | undefined;
  let attempt = 0;

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  while (attempt <= retries) {
    const result = await tryCatch(wrappedFn, ...args);
    if (result.success) return result;

    lastResult = result;
    attempt++;

    // If we've reached the max retries, break out of the loop
    if (attempt > retries) break;

    // Wait before the next attempt if delay is specified
    if (delay > 0) {
      const waitTime = exponential ? delay * Math.pow(2, attempt - 1) : delay;
      await sleep(waitTime);
    }
  }

  return lastResult!;
}

/**
 * Adds a timeout to an async function
 * @template T The success type
 * @template E The error type
 * @template Args The argument types
 * @param wrappedFn The wrapped async function
 * @param ms The timeout in milliseconds
 * @param args The arguments to pass to the function
 * @returns A Promise that resolves to a Result
 * @example
 * ```typescript
 * const timed = await timeout(fetchUser, 5000, '123');
 * ```
 */
export async function timeout<
  T,
  E extends Error,
  Args extends readonly unknown[]
>(
  wrappedFn: AsyncFnWithErr<T, E, Args>,
  ms: number,
  ...args: Args
): Promise<Result<T, E | TimeoutError>> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new TimeoutError(`Operation timed out after ${ms}ms`)),
      ms
    )
  );

  try {
    const data = await Promise.race([wrappedFn.fn(...args), timeoutPromise]);
    return { success: true, data };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      success: false,
      error: {
        raw: error as E | TimeoutError,
        message: error.message,
        code:
          error instanceof TimeoutError
            ? error.code
            : "code" in error
            ? (error as { code: string }).code
            : CommonErrorCodes.UNKNOWN,
      },
    };
  }
}
