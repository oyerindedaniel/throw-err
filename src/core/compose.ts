import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { createLogger } from "../utils/logger";
import { normalizeError } from "../utils/normalizeError";

const composeLogger = createLogger("compose");

/**
 * Composes an async function with multiple wrappers while inferring additional error types.
 * Each wrapper can introduce its own error type, which will be properly tracked in the
 * type system.
 *
 * @template T - The return type of the async function.
 * @template E - The initial error type that may be thrown.
 * @template Args - The argument types of the async function.
 * @param fn - The base async function to wrap.
 * @returns A function that takes multiple wrappers and returns the composed function.
 *
 * @example
 * // Create typed error classes using mkErrClass
 * const NetworkError = mkErrClass('NetworkError', 'NETWORK_ERROR');
 * const ValidationError = mkErrClass('ValidationError', 'VALIDATION_ERROR');
 * const AuthError = mkErrClass('AuthError', 'AUTH_ERROR');
 *
 * // Create base function with NetworkError
 * const fetchUser = asyncFn<InstanceType<typeof NetworkError>>()(
 *   async (userId: string) => {
 *     // Fetch user implementation...
 *     return { id: userId, name: 'John' };
 *   }
 * );
 *
 * // Create wrappers adding their own error types
 * const withValidation = (fn) => new AsyncFnWithErr(async (userId) => {
 *   if (!userId) throw new ValidationError('Invalid userId');
 *   return await fn.fn(userId);
 * });
 *
 * const withAuth = (fn) => new AsyncFnWithErr(async (userId) => {
 *   const isAuthorized = true; // Check authorization
 *   if (!isAuthorized) throw new AuthError('Not authorized');
 *   return await fn.fn(userId);
 * });
 *
 * // Compose function with error-adding wrappers
 * const getUser = compose(fetchUser)(withValidation, withAuth);
 *
 * // TypeScript correctly tracks all possible error types
 * const result = await tryCatchAsync(getUser, '123');
 * if (!result.success) {
 *   // result.error is typed as NetworkError | ValidationError | AuthError
 *   console.log(`Error: ${result.error.name}, Code: ${result.error.code}`);
 * }
 */
export function compose<T, E extends Error, Args extends readonly unknown[]>(
  fn: AsyncFnWithErr<T, E, Args>
) {
  // Define type for a wrapper function that adds additional error types
  type Wrapper<AddErr extends Error = never> = (
    fn: AsyncFnWithErr<T, E, Args>
  ) => AsyncFnWithErr<T, E | AddErr, Args>;

  // Define type to extract additional error types from an array of wrappers
  type GetAddedErrors<W extends ReadonlyArray<Wrapper<Error>>> =
    W extends ReadonlyArray<Wrapper<infer AddErr>>
      ? AddErr extends Error
        ? AddErr
        : never
      : never;

  return <W extends ReadonlyArray<Wrapper<Error>>>(
    ...wrappers: W
  ): AsyncFnWithErr<T, E | GetAddedErrors<W>, Args> => {
    // Initialize with the base function
    let result = fn as AsyncFnWithErr<T, E | GetAddedErrors<W>, Args>;

    for (const [index, wrapper] of wrappers.entries()) {
      console.debug(`Applying wrapper ${index + 1} of ${wrappers.length}`);
      result = wrapper(result as AsyncFnWithErr<T, E, Args>) as AsyncFnWithErr<
        T,
        E | GetAddedErrors<W>,
        Args
      >;
      console.debug(`Wrapper ${index + 1} applied successfully`);
    }

    return new AsyncFnWithErr<T, E | GetAddedErrors<W>, Args>(
      async (...args: Args) => {
        console.debug(`Executing with args: ${JSON.stringify(args)}`);
        try {
          const output = await result.fn(...args);
          console.debug(`Executed successfully`);
          return output;
        } catch (error) {
          console.error(`Failed with error: ${normalizeError(error).message}`);
          throw error;
        }
      }
    );
  };
}

/**
 * Composes two async functions with improved type inference.
 * The output of the first function is passed to the second function.
 *
 * @template T1 The return type of the first function
 * @template E1 The error type of the first function
 * @template Args1 The argument types of the first function
 * @template T2 The return type of the second function
 * @template E2 The error type of the second function
 * @returns A new AsyncFnWithErr that represents the composition of the two functions
 *
 * @example
 * const userWithPosts = pipe(fetchUser, (user) =>
 *   asyncFn<NetworkError>()(async () => {
 *     return await fetchPostsForUser(user.id);
 *   })
 * );
 */
export function pipe<
  T1,
  E1 extends Error,
  Args1 extends readonly unknown[],
  T2,
  E2 extends Error
>(
  fn1: AsyncFnWithErr<T1, E1, Args1>,
  fn2: (input: T1) => AsyncFnWithErr<T2, E2, readonly unknown[]>
): AsyncFnWithErr<T2, E1 | E2, Args1> {
  return new AsyncFnWithErr<T2, E1 | E2, Args1>(async (...args: Args1) => {
    composeLogger.debug(
      `Executing first function with arguments: ${JSON.stringify(args)}`
    );
    const result1 = await fn1.fn(...args);
    composeLogger.debug(`First function executed successfully`);

    const fn2Instance = fn2(result1);
    composeLogger.debug(`Executing second function`);
    const result2 = await fn2Instance.fn();
    composeLogger.debug(`Second function executed successfully`);
    return result2;
  });
}
