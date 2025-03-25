import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { createLogger } from "../utils/logger";

const composeLogger = createLogger("compose");

/**
 * Composes multiple async function wrappers into a single wrapper
 *
 * This version supports type-safe composition of wrappers that may introduce
 * additional error types.
 *
 * @template T The return type of the wrapped function
 * @template E The base error type of the wrapped function
 * @template Args The argument types of the wrapped function (as a tuple)
 * @template W1E Additional errors introduced by the first wrapper
 * @template W2E Additional errors introduced by the second wrapper
 * @template W3E Additional errors introduced by the third wrapper
 *
 * @param wrapper1 First wrapper function
 * @param wrapper2 Second wrapper function (optional)
 * @param wrapper3 Third wrapper function (optional)
 * @returns A composed wrapper function with accumulated error types
 *
 * @example
 * // Type-safe composition with explicit error types
 * const getUserWithRetryAndTimeout = compose<
 *   User,                    // Return type
 *   UserError,               // Base error type
 *   [string],                // Argument types
 *   NetworkError,            // Additional errors from withRetry
 *   TimeoutError             // Additional errors from withTimeout
 * >(
 *   withRetry,
 *   withTimeout
 * )(fetchUserById);
 *
 * // Result type is AsyncFnWithErr<User, UserError | NetworkError | TimeoutError, [string]>
 */
export function compose<
  T,
  E extends Error,
  Args extends readonly unknown[],
  W1E extends Error = never,
  W2E extends Error = never,
  W3E extends Error = never
>(
  wrapper1: <E1 extends Error>(
    fn: AsyncFnWithErr<T, E1, Args>
  ) => AsyncFnWithErr<T, E1 | W1E, Args>,
  wrapper2?: <E2 extends Error>(
    fn: AsyncFnWithErr<T, E2, Args>
  ) => AsyncFnWithErr<T, E2 | W2E, Args>,
  wrapper3?: <E3 extends Error>(
    fn: AsyncFnWithErr<T, E3, Args>
  ) => AsyncFnWithErr<T, E3 | W3E, Args>
): (
  fn: AsyncFnWithErr<T, E, Args>
) => AsyncFnWithErr<T, E | W1E | W2E | W3E, Args> {
  return (fn: AsyncFnWithErr<T, E, Args>) => {
    composeLogger.debug(`Composing wrappers`);

    // Apply wrappers in sequence from left to right
    let result: AsyncFnWithErr<T, Error, Args> = fn;

    if (wrapper1) {
      composeLogger.debug(`Applying wrapper 1`);
      result = wrapper1(result);
    }

    if (wrapper2) {
      composeLogger.debug(`Applying wrapper 2`);
      result = wrapper2(result);
    }

    if (wrapper3) {
      composeLogger.debug(`Applying wrapper 3`);
      result = wrapper3(result);
    }

    // Return a wrapped function that logs execution
    return new AsyncFnWithErr<T, E | W1E | W2E | W3E, Args>(
      async (...args: Args) => {
        composeLogger.debug(
          `Executing composed function with ${args.length} arguments`
        );
        try {
          const fnResult = await result.fn(...args);
          composeLogger.debug(`Composed function executed successfully`);
          return fnResult;
        } catch (error) {
          composeLogger.error(
            `Composed function failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          throw error;
        }
      }
    );
  };
}

/**
 * Composes an arbitrary number of wrappers, each potentially introducing additional error types.
 * The final error type is a union of the base error type and all additional errors specified.
 *
 * @template T The return type of the wrapped function
 * @template E The base error type of the wrapped function
 * @template Args The argument types of the wrapped function
 * @template AdditionalErrors The union of all additional error types introduced by the wrappers
 *
 * @param wrappers The wrappers to compose, applied from left to right
 * @returns A composed wrapper function with accumulated error types
 *
 * @example
 * const enhancedFetchUser = composeMany<User, UserError, [string], NetworkError | TimeoutError>(
 *   withRetry,
 *   withTimeout
 * )(fetchUser);
 * // Type: AsyncFnWithErr<User, UserError | NetworkError | TimeoutError, [string]>
 */
export function composeMany<
  T,
  E extends Error,
  Args extends readonly unknown[],
  AdditionalErrors extends Error = never
>(
  ...wrappers: Array<
    <E1 extends E | AdditionalErrors>(
      fn: AsyncFnWithErr<T, E1, Args>
    ) => AsyncFnWithErr<T, E1 | AdditionalErrors, Args>
  >
): (
  fn: AsyncFnWithErr<T, E, Args>
) => AsyncFnWithErr<T, E | AdditionalErrors, Args> {
  return (fn: AsyncFnWithErr<T, E, Args>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: AsyncFnWithErr<T, E | AdditionalErrors, Args> = fn as any; // Type assertion for accumulation

    // Apply each wrapper with logging
    for (const [index, wrapper] of wrappers.entries()) {
      composeLogger.debug(
        `Applying wrapper ${index + 1} of ${wrappers.length}`
      );
      result = wrapper(result);
      composeLogger.debug(`Wrapper ${index + 1} applied successfully`);
    }

    // Wrap the final composed function with execution logging
    return new AsyncFnWithErr<T, E | AdditionalErrors, Args>(
      async (...args: Args) => {
        composeLogger.debug(
          `Executing composed function with arguments: ${JSON.stringify(args)}`
        );
        try {
          const output = await result.fn(...args);
          composeLogger.debug(`Composed function executed successfully`);
          return output;
        } catch (error) {
          composeLogger.error(
            `Composed function failed with error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          throw error;
        }
      }
    );
  };
}

/**
 * Composes two async functions, creating a new function that passes
 * the output of the first to the second and combines their error types.
 *
 * @template T1 The return type of the first function
 * @template T2 The return type of the second function
 * @template E1 The error type of the first function
 * @template E2 The error type of the second function
 * @template Args1 The argument types of the first function
 * @param fn1 The first async function
 * @param fn2 A function that takes the result of fn1 and returns a new AsyncFnWithErr
 * @returns A composed AsyncFnWithErr that combines both functions
 * @example
 * ```typescript
 * const fetchUserPosts = composeFns(
 *   fetchUser,
 *   user => asyncFn<PostError>()(async () => {
 *     const response = await fetch(`/api/users/${user.id}/posts`);
 *     if (!response.ok) throw new PostError('Failed to fetch posts');
 *     return await response.json();
 *   })
 * );
 *
 * // Combined error type is FetchError | PostError
 * const result = await tryCatch(fetchUserPosts, '123');
 * ```
 */
export function composeFns<
  T1,
  T2,
  E1 extends Error,
  E2 extends Error,
  Args1 extends readonly unknown[]
>(
  fn1: AsyncFnWithErr<T1, E1, Args1>,
  fn2: (input: T1) => AsyncFnWithErr<T2, E2, readonly unknown[]>
): AsyncFnWithErr<T2, E1 | E2, Args1> {
  composeLogger.debug(`Composing functions directly`);

  return new AsyncFnWithErr<T2, E1 | E2, Args1>(async (...args: Args1) => {
    composeLogger.debug(
      `Executing first function with ${args.length} arguments`
    );

    // Execute the first function
    const result1 = await fn1.fn(...args);
    composeLogger.debug(`First function executed successfully`);

    // Create and execute the second function with the result of the first
    const fn2Instance = fn2(result1);
    composeLogger.debug(`Created second function, executing it`);

    const result2 = await fn2Instance.fn();
    composeLogger.debug(`Second function executed successfully`);

    return result2;
  });
}
