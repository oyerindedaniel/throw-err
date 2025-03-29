import {
  Result,
  ExtractResultError,
  SuccessResult,
  ResultError,
} from "../types/Result";
import { CommonErrorCodes } from "../core/ErrorCode";
import { MapperFn } from "./mapperFn";
import { tryCatchAsync } from "../core/tryCatch";
import { asyncFn } from "../core/asyncFn";
import { getErrorCode, normalizeError } from "../utils/normalizeError";

/**
 * Simple map function that transforms the success value of a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @param result The result to transform
 * @param fn A function that maps T to U
 * @returns A new Result with either the transformed value or the original error
 *
 * @remarks
 * Use this function when:
 * - You need to transform a success value
 * - The transformer function is simple and unlikely to throw errors
 * - You want to maintain the original error type unchanged
 *
 * This is the most basic transformation function. For more robust error handling,
 * consider using mapSync or mapResult instead.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123'); // Result<User, FetchError>
 *
 * // Transform the user data to display name
 * const nameResult = map(
 *   userResult,
 *   user => `${user.firstName} ${user.lastName}`
 * );
 * ```
 */
export function map<T, U, E extends Error>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (!result.success) {
    return Result.failure(result.error);
  }

  try {
    return Result.success(fn(result.data));
  } catch (err) {
    return Result.failure(normalizeError<E>(err));
  }
}

/**
 * Transforms the success value of a Result with typed error handling
 * If the mapper throws, the error is properly typed and included in the result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template M The mapper error type
 * @param result The result to transform
 * @param mapper A MapperFn instance that maps T to U (can throw errors of type M)
 * @returns A new Result with either the transformed value or either of the error types
 *
 * @remarks
 * Use this function when:
 * - You need to transform success values with proper error handling
 * - Your transformation might throw specific errors you want to catch
 * - You want to leverage the type-safety of MapperFn
 *
 * This provides more robust error handling than map or mapSync because it
 * works with MapperFn to properly type potential errors from the transformation.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Create a mapper with ParseError as the error type
 * const parseJson = mapperFn<ParseError>()((text: string) => {
 *   try {
 *     return JSON.parse(text);
 *   } catch (err) {
 *     throw new ParseError("Failed to parse JSON", { line: 5 });
 *   }
 * });
 *
 * // Type safety is maintained without explicit type parameters
 * const jsonResult = await mapResult(userResult, parseJson);
 *
 * // Type system knows the result could have either error type
 * if (!jsonResult.success) {
 *   if (isErrorType(jsonResult.error.raw, ParseError)) {
 *     console.error(`JSON parse error at line ${jsonResult.error.raw.line}`);
 *   } else {
 *     console.error(`Fetch error: ${jsonResult.error.message}`);
 *   }
 * }
 * ```
 */
export async function mapResult<T, U, E extends Error, M extends Error = E>(
  result: Result<T, E>,
  mapper: MapperFn<T, U, M>
): Promise<Result<U, E | M>> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  const mappingResult = await tryCatchAsync(
    asyncFn<M>()(async () => Promise.resolve(mapper.fn(result.data)))
  );

  if (mappingResult.success) {
    return Result.success(mappingResult.data); // U
  } else {
    return Result.failure(mappingResult.error); // M
  }
}

/**
 * Transforms the error type in a Result
 * @template T The success type
 * @template E The original error type
 * @template F The new error type
 * @param result The result to transform
 * @param mapper A function that maps E to F
 * @returns A New Result with the transformed error
 *
 * @remarks
 * Use this function when:
 * - You need to convert error types for API boundaries
 * - You want to add additional context to errors
 * - You're standardizing errors across different operations
 *
 * This is particularly useful when working with errors from external sources
 * that you want to normalize into your application's error types.
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(fetchUser, '123');
 *
 * // Convert network errors to application errors
 * const appResult = mapError(
 *   result,
 *   err => {
 *     if (isErrorType(err, NetworkError)) {
 *       return new AppError(`Connection issue: ${err.message}`);
 *     }
 *     return new AppError(`Unknown error: ${err.message}`);
 *   }
 * );
 * ```
 */
export function mapError<T, E extends Error, F extends Error>(
  result: Result<T, E>,
  mapper: (error: E) => F
): Result<T, F> {
  if (!result.success) {
    const transformedError = mapper(result.error.raw);

    return Result.failure({
      raw: transformedError,
      message: transformedError.message,
      code: getErrorCode(transformedError),
    });
  }
  return Result.success(result.data);
}

/**
 * Chains operations where the mapper returns a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The mapper's result error type (inferred from inner Result)
 * @template M The mapper function's possible error type
 * @param result The original result
 * @param mapper A MapperFn that maps T to Result<U, F> (can itself throw errors of type M)
 * @returns A result that combines all possible error types
 *
 * @remarks
 * Use this function when:
 * - You need to chain operations that return Results
 * - Your operations might throw errors
 * - You want comprehensive error typing
 *
 * This is the most powerful and type-safe way to chain Result operations.
 * It properly handles and types all possible error sources.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123"); // Result<User, FetchError>
 *
 * // Create a mapper with DatabaseError as the error type
 * const fetchPosts = mapperFn<DatabaseError>()((user) => {
 *   if (!user.id) throw new DatabaseError("Cannot process user without ID");
 *   return tryCatchAsync(fetchUserPosts, user.id); // Result<Post[], NotFoundError>
 * });
 *
 * // Type safety is maintained, F is inferred as NotFoundError
 * const postsResult = await flatMapResult(userResult, fetchPosts);
 * // Result<Post[], FetchError | NotFoundError | DatabaseError>
 *
 * if (!postsResult.success) {
 *   if (isErrorType(postsResult.error.raw, FetchError)) {
 *     // Original error from userResult
 *   } else if (isErrorType(postsResult.error.raw, NotFoundError)) {
 *     // Error from the nested tryCatchAsync in fetchPosts
 *   } else if (isErrorType(postsResult.error.raw, DatabaseError)) {
 *     // Error thrown by the mapper function itself
 *   }
 * }
 * ```
 */
export async function flatMapResult<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: MapperFn<T, Result<U, F>, M>
): Promise<Result<U, E | F | M>> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  const mappingResult = await tryCatchAsync(
    asyncFn<M>()(async () => Promise.resolve(mapper.fn(result.data)))
  );

  if (mappingResult.success) {
    const innerResult = mappingResult.data; // Type: Result<U, F>
    if (innerResult.success) {
      return Result.success(innerResult.data); // U
    } else {
      return Result.failure(innerResult.error); // F
    }
  } else {
    return Result.failure(mappingResult.error); // M
  }
}

/**
 * Recovers from errors by transforming them or providing fallback data
 * @template T The original success type
 * @template R The recovery success type
 * @template E The original error type
 * @template F The handler's result error type
 * @template M The handler's thrown error type
 * @param result The original result
 * @param handler A MapperFn that maps E to Result<R, F> and may throw M
 * @returns A new Result with combined success and error types
 *
 * @remarks
 * Use this function when:
 * - You need sophisticated error recovery
 * - Your recovery logic might produce new errors
 * - You want to maintain type safety throughout
 *
 * This is the most powerful error recovery function, allowing recovery
 * paths that may themselves produce typed errors.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Try fetching from cache if network fails
 * const cachedFetch = mapperFn<CacheError>()((error) => {
 *   if (error.raw instanceof NetworkError) {
 *     return fetchFromCache('user-123'); // Returns Result<User, CacheError>
 *   }
 *   throw new AppError("Unrecoverable error");
 * });
 *
 * const finalResult = await recoverWithResult(userResult, cachedFetch);
 * // Type: Result<User, NetworkError | CacheError | AppError>
 * ```
 */
export async function recoverWithResult<
  T,
  R,
  E extends Error,
  F extends Error,
  M extends Error = F
>(
  result: Result<T, E>,
  handler: MapperFn<ExtractResultError<Result<T, E>>, Result<R, F>, M>
): Promise<Result<T | R, E | F | M>> {
  if (!result.success) {
    const handlerResult = await tryCatchAsync(
      asyncFn<M>()(async () => Promise.resolve(handler.fn(result.error)))
    );

    if (handlerResult.success) {
      const innerResult = handlerResult.data; // Result<R, F>
      if (innerResult.success) {
        return Result.success(innerResult.data); // R
      } else {
        return Result.failure(innerResult.error); // F
      }
    } else {
      return Result.failure(handlerResult.error); // M
    }
  }
  return Result.success(result.data); // T
}

/**
 * Functions to recover from failed Results with fallback values
 */
export const recover = {
  /**
   * Synchronously recovers from a failed Result with a fallback value
   * @template T The original success type
   * @template R The fallback success type
   * @template E The original error type
   * @param result The original result
   * @param fallback A value or synchronous function to provide R on failure
   * @returns Original success or fallback on failure, synchronously
   *
   * @remarks
   * When providing a function as fallback:
   * - It MUST NOT have side effects (network calls, state changes, etc.)
   * - It MUST NOT throw errors (all error handling should happen inside the function)
   * - For async recovery, use recover.async instead
   *
   * @example
   * ```typescript
   * const userResult = await tryCatchAsync(fetchUser, '123');
   * const safeUser = recover.sync(userResult, { name: 'Guest User' });
   * ```
   */
  sync<T, R, E extends Error>(
    result: Result<T, E>,
    fallback: R | ((error: ExtractResultError<Result<T, E>>) => R)
  ): SuccessResult<T | R> {
    if (result.success) {
      return Result.success(result.data);
    }

    try {
      if (typeof fallback === "function") {
        const fn = fallback as (error: ExtractResultError<Result<T, E>>) => R;
        return Result.success(fn(result.error));
      }
      return Result.success(fallback);
    } catch {
      return Result.success({} as R);
    }
  },

  /**
   * Asynchronously recovers from a failed Result with a fallback value or async function
   * @template T The original success type
   * @template R The fallback success type
   * @template E The original error type
   * @param result The original result
   * @param fallback A Promise, value, or async function to provide R on failure
   * @returns Original success or fallback on failure, as a Promise
   *
   * @remarks
   * When providing a function as fallback:
   * - It MUST NOT have side effects (network calls, state changes, etc.)
   * - It MUST NOT throw errors (all error handling should happen inside the function)
   * - For complex error handling, consider using `recoverWithResult` instead
   *
   * @example
   * ```typescript
   * const dataResult = await tryCatchAsync(fetchData, 'endpoint');
   * const processedData = await recover.async(dataResult, async (err) => {
   *   const cachedData = await getCachedData();
   *   return { ...cachedData, fromCache: true };
   * });
   * ```
   */
  async async<T, R, E extends Error>(
    result: Result<T, E>,
    fallback:
      | R
      | Promise<R>
      | ((error: ExtractResultError<Result<T, E>>) => R | Promise<R>)
  ): Promise<SuccessResult<T | R>> {
    if (result.success) {
      return Promise.resolve(Result.success(result.data));
    }

    try {
      let resolvedFallback: R | Promise<R>;

      if (typeof fallback === "function") {
        resolvedFallback = (
          fallback as (
            error: ExtractResultError<Result<T, E>>
          ) => R | Promise<R>
        )(result.error);
      } else {
        resolvedFallback = fallback;
      }

      return Promise.resolve(resolvedFallback).then((data) =>
        Result.success(data)
      );
    } catch {
      return Promise.resolve(Result.success({} as R));
    }
  },
};

export function combineResults<T, E extends Error>(
  results: Result<T, E>[]
): Result<T[], E> {
  const successes: T[] = [];
  for (const result of results) {
    if (result.success) {
      successes.push(result.data);
    } else {
      return Result.failure(result.error); // E
    }
  }
  return Result.success(successes);
}

export async function sequenceResults<T, E extends Error>(
  promises: Promise<Result<T, E>>[]
): Promise<Result<T[], E>> {
  const results = await Promise.all(promises);
  return combineResults(results);
}

/**
 * Maps both success and error values of a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The transformed error type
 * @param result The result to transform
 * @param successMapper A function that maps T to U
 * @param errorMapper A function that maps E to F
 * @returns A new Result with transformed success or error values
 *
 * @remarks
 * Use this function when:
 * - You need to transform both success and error values
 * - The transformations are simple and unlikely to throw
 * - You want to process both paths in a single operation
 *
 * This is useful for normalizing Results before crossing API boundaries.
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(fetchUser, '123');
 *
 * // Transform both success and error cases
 * const transformed = transformBoth(
 *   result,
 *   user => ({ ...user, displayName: `${user.firstName} ${user.lastName}` }),
 *   err => new AppError(`Failed to fetch user: ${err.message}`)
 * );
 * ```
 */
export function transformBoth<T, U, E extends Error, F extends Error>(
  result: Result<T, E>,
  successMapper: (data: T) => U,
  errorMapper: (error: E) => F
): Result<U, F> {
  if (result.success) {
    return Result.success(successMapper(result.data));
  } else {
    const transformedError = errorMapper(result.error.raw);
    return Result.failure({
      raw: transformedError,
      message: transformedError.message,
      code: getErrorCode(transformedError),
    });
  }
}

/**
 * Maps both success and error values of a Result with type-safe error handling
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The transformed error type
 * @template MS The success mapper error type
 * @template ME The error mapper error type
 * @param result The result to transform
 * @param successMapper A MapperFn instance that maps T to U (can throw errors of type MS)
 * @param errorMapper A MapperFn instance that maps E to F (can throw errors of type ME)
 * @returns A new Result with transformed values or error from the mapping process
 *
 * @remarks
 * Use this function when:
 * - You need to transform both success and error values
 * - Your transformations might throw errors themselves
 * - You need comprehensive type safety
 *
 * This is a more robust version of transformBoth that handles errors thrown during mapping.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Create mappers with proper error typing
 * const formatUser = mapperFn<FormatError>()((user) => {
 *   if (!user.firstName || !user.lastName) {
 *     throw new FormatError("User has incomplete name data");
 *   }
 *   return { ...user, displayName: `${user.firstName} ${user.lastName}` };
 * });
 *
 * const convertToAppError = mapperFn<ConversionError>()((err) => {
 *   if (err instanceof NetworkError) {
 *     throw new ConversionError("Cannot convert network errors");
 *   }
 *   return new AppError(`Failed to process user: ${err.message}`);
 * });
 *
 * // Get a Result with comprehensive error typing
 * const result = await transformBothWithMappers(
 *   userResult,
 *   formatUser,
 *   convertToAppError
 * );
 *
 * // Type system knows about all possible error types
 * // Result<FormattedUser, AppError | FormatError | ConversionError>
 * ```
 */
export async function transformBothWithMappers<
  T,
  U,
  E extends Error,
  F extends Error,
  MS extends Error = never,
  ME extends Error = never
>(
  result: Result<T, E>,
  successMapper: MapperFn<T, U, MS>,
  errorMapper: MapperFn<E, F, ME>
): Promise<Result<U, F | MS | ME>> {
  if (result.success) {
    const mappingResult = await tryCatchAsync(
      asyncFn<MS>()(async () => Promise.resolve(successMapper.fn(result.data)))
    );

    if (mappingResult.success) {
      return Result.success(mappingResult.data); // U
    } else {
      return Result.failure(mappingResult.error); // ResultError<MS>
    }
  } else {
    const mappingResult = await tryCatchAsync(
      asyncFn<ME>()(async () =>
        Promise.resolve(errorMapper.fn(result.error.raw))
      )
    );

    if (mappingResult.success) {
      const transformedError = mappingResult.data;
      return Result.failure({
        raw: transformedError,
        message: transformedError.message,
        code: getErrorCode(transformedError),
      });
    } else {
      return Result.failure(mappingResult.error);
    }
  }
}

/**
 * Collects results from multiple operations, grouping successes and failures
 * @template T The success type
 * @template E The error type
 * @param results Array of Results to collect
 * @returns A Result containing either all success values or a special CollectedErrors object
 *
 * @remarks
 * Use this function when:
 * - You need to process multiple operations that may fail
 * - You want to collect all errors instead of failing on the first one
 * - You need access to all the errors for reporting or analysis
 *
 * Unlike combineResults which fails fast on the first error,
 * this collects all success and error results.
 *
 * @example
 * ```typescript
 * const results = [
 *   await tryCatchAsync(fetchUser, '123'),
 *   await tryCatchAsync(fetchUser, '456'),
 *   await tryCatchAsync(fetchUser, '789')
 * ];
 *
 * const collected = collectResults(results);
 *
 * if (collected.success) {
 *   console.log(`Found ${collected.data.length} users`);
 * } else {
 *   console.error(`${collected.error.raw.errors.length} operations failed`);
 *   collected.error.raw.errors.forEach(err =>
 *     console.error(err.message)
 *   );
 * }
 * ```
 */
export function collectResults<T, E extends Error>(
  results: Result<T, E>[]
): Result<T[], CollectedErrors<E>> {
  const successes: T[] = [];
  const errors: ResultError<E>[] = [];

  for (const result of results) {
    if (result.success) {
      successes.push(result.data);
    } else {
      errors.push(result.error);
    }
  }

  return errors.length === 0
    ? Result.success(successes)
    : Result.failure({
        raw: new CollectedErrors(errors),
        message: `${errors.length} operation(s) failed`,
        code: CommonErrorCodes.UNKNOWN,
      });
}

/**
 * A special error type for representing multiple collected errors
 * @template E The error type contained in the collection
 */
export class CollectedErrors<E extends Error> extends Error {
  constructor(public errors: ResultError<E>[]) {
    super(`${errors.length} operation(s) failed`);
    this.name = "CollectedErrors";
  }
}

/**
 * Filters a success Result by applying a predicate to the data
 * @template T The success type
 * @template E The error type
 * @param result The Result to filter
 * @param predicate A function that returns true if the data passes the filter
 * @param errorFn A function that creates an error if the data fails the filter
 * @returns The original Result or a failure Result with the error from errorFn
 *
 * @remarks
 * Use this function when:
 * - You need to validate success values with custom logic
 * - You want to convert invalid data to typed errors
 * - You want to ensure data meets certain criteria before proceeding
 *
 * This is useful for data validation in Result chains.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Filter out users without a complete profile
 * const validUserResult = filterResult(
 *   userResult,
 *   user => Boolean(user.name && user.email),
 *   user => new ValidationError(`User ${user.id} has incomplete profile`)
 * );
 *
 * // Proceed only with valid users
 * if (validUserResult.success) {
 *   processUser(validUserResult.data);
 * }
 * ```
 */
export function filterResult<T, E extends Error>(
  result: Result<T, E>,
  predicate: (data: T) => boolean,
  errorFn: (data: T) => E
): Result<T, E> {
  if (result.success && !predicate(result.data)) {
    const error = errorFn(result.data);
    return Result.failure({
      raw: error,
      message: error.message,
      code: getErrorCode(error),
    });
  }
  return result;
}

/**
 * Runs a side effect function on success data without changing the Result
 * @template T The success type
 * @template E The error type
 * @param result The result to tap into
 * @param fn A function that performs a side effect with T
 * @returns The original Result unchanged
 *
 * @remarks
 * Use this function when:
 * - You need to perform side effects (logging, metrics, etc.)
 * - You don't want to change the Result
 * - You want to inspect success values without breaking the chain
 *
 * This is perfect for diagnostic operations in Result chains.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Log successful user fetches without changing the Result
 * const result = tap(userResult, user => {
 *   console.log(`User fetched: ${user.id}`);
 *   analytics.trackUserFetch(user.id);
 * });
 *
 * // Continue using the unchanged Result
 * if (result.success) {
 *   displayUser(result.data);
 * }
 * ```
 */
export function tap<T, E extends Error>(
  result: Result<T, E>,
  fn: (data: T) => void
): Result<T, E> {
  if (result.success) {
    try {
      fn(result.data);
    } catch (err) {
      // Ignore errors from the tap function
      console.warn("Error in tap function:", err);
    }
  }
  return result;
}

/**
 * Runs a side effect function on error without changing the Result
 * @template T The success type
 * @template E The error type
 * @param result The result to tap into
 * @param fn A function that performs a side effect with ResultError<E>
 * @returns The original Result unchanged
 *
 * @remarks
 * Use this function when:
 * - You need to perform side effects on errors (logging, metrics, etc.)
 * - You don't want to change the Result
 * - You want to inspect errors without breaking the chain
 *
 * This is perfect for error logging in Result chains.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Log errors without changing the Result
 * const result = tapError(userResult, err => {
 *   console.error(`Failed to fetch user: ${err.message}`);
 *   errorReporting.captureException(err.raw);
 * });
 *
 * // Continue handling the unchanged Result
 * if (!result.success) {
 *   showErrorMessage(result.error.message);
 * }
 * ```
 */
export function tapError<T, E extends Error>(
  result: Result<T, E>,
  fn: (error: ResultError<E>) => void
): Result<T, E> {
  if (!result.success) {
    try {
      fn(result.error);
    } catch (err) {
      // Ignore errors from the tapError function
      console.warn("Error in tapError function:", err);
    }
  }
  return result;
}

/**
 * Extracts the success value or returns a fallback
 * @template T The success type
 * @template E The error type
 * @param result The result to extract value from
 * @param defaultValue The value to return if result is a failure
 * @returns Either the success data or the default value
 *
 * @remarks
 * Unlike recoverWithDefault which returns a Result, this
 * directly returns the unwrapped value. This is useful when
 * you just want the value and don't need to keep working with Results.
 *
 * @example
 * ```typescript
 * const configResult = await tryCatchAsync(fetchConfig, "app");
 *
 * // Get timeout value or default to 5000ms
 * const timeout = getOrElse(configResult, 5000);
 *
 * // Use the value directly
 * setTimeout(checkConnection, timeout);
 * ```
 */
export function getOrElse<T, E extends Error>(
  result: Result<T, E>,
  defaultValue: T
): T {
  return result.success ? result.data : defaultValue;
}

/**
 * Converts a Result to a Promise
 * @template T The success type
 * @template E The error type
 * @param result The result to convert
 * @returns A Promise that resolves with data or rejects with the raw error
 *
 * @remarks
 * This is useful when integrating with Promise-based APIs that expect
 * standard Error objects in rejection cases. The rejected Promise contains
 * only the raw error from the Result, not the full error object with additional metadata.
 *
 * @example
 * ```typescript
 * try {
 *   const userResult = await tryCatchAsync(fetchUser, '123');
 *
 *   // Convert to Promise, rejecting with the raw error
 *   const user = await toPromise(userResult);
 *
 *   return user;
 * } catch (err) {
 *   // err is the raw error (e.g., NetworkError, NotFoundError)
 *   if (isErrorType(err, NetworkError)) {
 *     retry();
 *   } else {
 *     console.error("Error:", err.message);
 *   }
 *   return null;
 * }
 * ```
 */
export function toPromise<T, E extends Error>(
  result: Result<T, E>
): Promise<T> {
  if (result.success) {
    return Promise.resolve(result.data);
  } else {
    return Promise.reject(result.error.raw);
  }
}

/**
 * Converts a Promise to a Result
 * @template T The success type
 * @template E The error type
 * @param promise The promise to convert
 * @param errorFactory Optional function to convert unknown errors to specific error types
 * @returns A Promise that resolves to a Result
 *
 * @remarks
 * This function can take an optional error factory function that converts any thrown errors
 * to a specific error type E. This is useful when working with external APIs where you want
 * to normalize errors to your domain-specific error types.
 *
 * When using with external APIs, you can provide a custom error factory that checks
 * the error message or properties and returns an appropriate typed error for your domain.
 *
 * @example
 * ```typescript
 * // Convert any error to a custom ApplicationError
 * const result = await fromPromise(
 *   externalApi.fetchData(),
 *   (err) => {
 *     if (err instanceof Error && err.message.includes("network")) {
 *       return new NetworkError("Network failure", { retryable: true });
 *     }
 *     return new ApplicationError(`External API error: ${String(err)}`);
 *   }
 * );
 * ```
 */
export async function fromPromise<T, E extends Error = Error>(
  promise: Promise<T>,
  errorFactory?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return Result.success(data);
  } catch (err) {
    if (errorFactory) {
      // Use the custom error factory to convert the error
      const typedError = errorFactory(err);
      return Result.failure({
        raw: typedError,
        message: typedError.message,
        code: getErrorCode(typedError),
      });
    }
    // Default error handling
    return Result.failure(normalizeError<E>(err));
  }
}

/**
 * Converts a standard Promise to a Result
 * @template T The success type
 * @template E The error type
 * @param promise The promise to convert
 * @returns A Promise that resolves to a Result
 *
 * @remarks
 * Use this function when:
 * - Working with external Promise-based APIs
 * - You want to integrate Promises into your Result-based error handling
 * - You need to normalize errors from any source
 *
 * This is particularly useful for integrating third-party libraries that use Promises.
 *
 * @example
 * ```typescript
 * // Working with a third-party API that returns Promises
 * const userPromise = externalApi.getUser('123');
 *
 * // Convert to a Result for consistent error handling
 * const userResult = await promiseToResult(userPromise);
 *
 * // Now you can use all your Result utilities
 * const safeUser = recoverWithDefault(userResult, { name: 'Guest' });
 * ```
 */
export async function promiseToResult<T, E extends Error = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  return tryCatchAsync(asyncFn<E>()(async () => promise));
}

/**
 * Converts a Result to a Promise
 * @template T The success type
 * @template E The error type
 * @param result The result to convert
 * @returns A Promise that resolves with data or rejects with the raw error
 *
 * @remarks
 * Use this function when:
 * - You need to integrate with Promise-based APIs
 * - You're at the boundary of your Result-based code and external code
 * - You want to convert back to the standard Promise rejection model
 *
 * @example
 * ```typescript
 * try {
 *   const userResult = await tryCatchAsync(fetchUser, '123');
 *
 *   // Convert to Promise, rejecting with the raw error
 *   const user = await resultToPromise(userResult);
 *
 *   return user;
 * } catch (err) {
 *   // err is the raw error (e.g., NetworkError, NotFoundError)
 *   if (isErrorType(err, NetworkError)) {
 *     retry();
 *   } else {
 *     console.error("Error:", err.message);
 *   }
 *   return null;
 * }
 * ```
 */
export function resultToPromise<T, E extends Error>(
  result: Result<T, E>
): Promise<T> {
  if (result.success) {
    return Promise.resolve(result.data);
  } else {
    return Promise.reject(result.error.raw);
  }
}

/**
 * Extracts the success value or returns a default (synchronous)
 * @template T The success type
 * @template E The error type
 * @param result The result to extract value from
 * @param defaultValue The value to return if result is a failure
 * @returns Either the success data or the default value
 *
 * @remarks
 * Use this function when:
 * - You're at the end of your Result chain
 * - You just want the raw value with a fallback
 * - You don't need to continue with Result operations
 *
 * This is a simpler alternative to using recover when you just need the value.
 *
 * @example
 * ```typescript
 * const configResult = await tryCatchAsync(fetchConfig, "app");
 *
 * // Get timeout value or default to 5000ms
 * const timeout = getValueOrDefault(configResult, 5000);
 *
 * // Use the value directly
 * setTimeout(checkConnection, timeout);
 * ```
 */
export function getValueOrDefault<T, E extends Error>(
  result: Result<T, E>,
  defaultValue: T
): T {
  return result.success ? result.data : defaultValue;
}

/**
 * Transforms the success value of a Result (synchronous version)
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template M The mapper error type
 * @param result The result to transform
 * @param mapper A function that maps T to U (can throw errors of type M)
 * @returns A new Result with either the transformed value or either of the error types
 *
 * @remarks
 * Use this function when:
 * - You need to transform success values synchronously
 * - You want to maintain proper error typing
 * - You don't need the full power of a MapperFn
 *
 * This function properly captures and types any errors that occur during mapping.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Parse the user's data synchronously
 * const parsedResult = mapSync(
 *   userResult,
 *   user => ({ ...user, age: parseInt(user.ageString) })
 * );
 *
 * if (parsedResult.success) {
 *   console.log(`User is ${parsedResult.data.age} years old`);
 * }
 * ```
 */
export function mapSync<T, U, E extends Error, M extends Error = E>(
  result: Result<T, E>,
  mapper: (data: T) => U
): Result<U, E | M> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  try {
    const data = mapper(result.data);
    return Result.success(data);
  } catch (err) {
    return Result.failure(normalizeError<M>(err));
  }
}

/**
 * Chains operations where the mapper returns a Result (synchronous version)
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The mapper's result error type
 * @template M The mapper function's possible error type
 * @param result The original result
 * @param mapper A function that maps T to Result<U, F> (can throw errors of type M)
 * @returns A result that combines all possible error types
 *
 * @remarks
 * Use this function when:
 * - You need to chain operations synchronously
 * - Your mapper function returns another Result
 * - You want proper error typing across the chain
 *
 * This is the synchronous counterpart to flatMapResult.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Synchronously validate and transform user data
 * const validatedResult = flatMapSync(
 *   userResult,
 *   user => {
 *     if (!user.email) return Result.failure({
 *       raw: new ValidationError("Email required"),
 *       message: "Email required",
 *       code: CommonErrorCodes.VALIDATION
 *     });
 *     return Result.success({ ...user, validated: true });
 *   }
 * );
 * ```
 */
export function flatMapSync<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: (data: T) => Result<U, F>
): Result<U, E | F | M> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  try {
    const innerResult = mapper(result.data); // Type: Result<U, F>
    if (innerResult.success) {
      return Result.success(innerResult.data); // U
    } else {
      return Result.failure(innerResult.error); // F
    }
  } catch (err) {
    return Result.failure(normalizeError<M>(err)); // M
  }
}

/**
 * Recovers from errors by transforming them or providing fallback data (synchronous version)
 * @template T The original success type
 * @template R The recovery success type
 * @template E The original error type
 * @template F The handler's result error type
 * @template M The handler's thrown error type
 * @param result The original result
 * @param handler A function that maps ResultError<E> to Result<R, F> and may throw M
 * @returns A new Result with combined success and error types
 *
 * @remarks
 * Use this function when:
 * - You need sophisticated error recovery without async operations
 * - Your recovery logic might produce new errors
 * - You want to maintain type safety throughout
 *
 * This is the synchronous version of recoverWithResult for cases where
 * you don't need async operations in your recovery logic.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Synchronously recover from certain errors
 * const safeResult = recoverWithResultSync(
 *   userResult,
 *   error => {
 *     if (error.raw instanceof NotFoundError) {
 *       return Result.success({ id: '123', name: 'Guest User' });
 *     }
 *     // Rethrow other errors as app errors
 *     return Result.failure({
 *       raw: new AppError(`User fetch failed: ${error.message}`),
 *       message: `User fetch failed: ${error.message}`,
 *       code: CommonErrorCodes.UNKNOWN
 *     });
 *   }
 * );
 * ```
 */
export function recoverWithResultSync<
  T,
  R,
  E extends Error,
  F extends Error,
  M extends Error = F
>(
  result: Result<T, E>,
  handler: (error: ExtractResultError<Result<T, E>>) => Result<R, F>
): Result<T | R, F | M> {
  if (!result.success) {
    try {
      const innerResult = handler(result.error); // Result<R, F>
      if (innerResult.success) {
        return Result.success(innerResult.data); // R
      } else {
        return Result.failure(innerResult.error); // F
      }
    } catch (err) {
      return Result.failure(normalizeError<M>(err)); // M
    }
  }
  return Result.success(result.data); // T
}

/**
 * Synchronously applies a MapperFn that returns a Result
 * @template T The original success type
 * @template U The success type of the inner Result
 * @template E The original error type
 * @template F The error type of the inner Result
 * @template M The mapper's thrown error type
 * @param result The original Result
 * @param mapper A MapperFn that returns a Result
 * @returns A new Result combining all possible error types
 *
 * @remarks
 * This is the synchronous version of flatMapResult. Use this when
 * the mapper function doesn't need to perform async operations.
 *
 * @example
 * ```typescript
 * const userResult = tryCatchSync(parseUserSync, userJson);
 *
 * // Create a mapper that returns a Result
 * const validateUser = mapperFn<ValidationError>()((user) => {
 *   if (!user.email) {
 *     return Result.failure({
 *       raw: new ValidationError("Email required"),
 *       message: "Email is required",
 *       code: "VALIDATION_ERROR"
 *     });
 *   }
 *   return Result.success(user);
 * });
 *
 * // Map with proper error typing
 * const validatedResult = flatMapWithMapperSync(userResult, validateUser);
 * ```
 */
export function flatMapWithMapperSync<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: MapperFn<T, Result<U, F>, M>
): Result<U, E | F | M> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  try {
    const innerResult = mapper.fn(result.data);

    // Ensure innerResult is not a Promise
    if (innerResult instanceof Promise) {
      throw new Error(
        "Expected synchronous Result, but got Promise<Result>. Use flatMapResult for async operations."
      );
    }

    if (innerResult.success) {
      return Result.success(innerResult.data);
    } else {
      return Result.failure(innerResult.error);
    }
  } catch (err) {
    return Result.failure(normalizeError<M>(err));
  }
}
