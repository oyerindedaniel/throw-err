import {
  Result,
  ExtractResultError,
  SuccessResult,
  ResultError,
} from "../types/Result";
import { CommonErrorCodes, ErrorCode } from "../core/ErrorCode";
import { MapperFn } from "./mapperFn";
import { tryCatch } from "../core/tryCatch";
import { asyncFn } from "../core/asyncFn";
import { normalizeError } from "../utils/normalizeError";

/**
 * Transforms the success value of a Result
 * If the mapper throws, the error is properly typed and included in the result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template M The mapper error type
 * @param result The result to transform
 * @param mapper A MapperFn instance that maps T to U (can throw errors of type M)
 * @returns A new Result with either the transformed value or either of the error types
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, "123");
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

  const mappingResult = await tryCatch(
    asyncFn<M>()(async () => Promise.resolve(mapper.fn(result.data)))
  );

  if (mappingResult.success) {
    return Result.success(mappingResult.data); // U
  } else {
    return Result.failure(mappingResult.error); // M
  }
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
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, "123"); // Result<User, FetchError>
 *
 * // Create a mapper with DatabaseError as the error type
 * const fetchPosts = mapperFn<DatabaseError>()((user) => {
 *   if (!user.id) throw new DatabaseError("Cannot process user without ID");
 *   return tryCatch(fetchUserPosts, user.id); // Result<Post[], NotFoundError>
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
 *     // Error from the nested tryCatch in fetchPosts
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

  const mappingResult = await tryCatch(
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
 */
export async function catchErr<
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
    const handlerResult = await tryCatch(
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
 * Recovers from errors by transforming them or providing fallback data (synchronous version)
 * @template T The original success type
 * @template R The recovery success type
 * @template E The original error type
 * @template F The handler's result error type
 * @template M The handler's thrown error type
 * @param result The original result
 * @param handler A function that maps ResultError<E> to Result<R, F> and may throw M
 * @returns A new Result with combined success and error types
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, '123');
 *
 * // Synchronously recover from certain errors
 * const safeResult = catchErrSync(
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
export function catchErrSync<
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
   * const userResult = await tryCatch(fetchUser, '123');
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
   * - For complex error handling, consider using `catchErr` instead
   *
   * @example
   * ```typescript
   * const dataResult = await tryCatch(fetchData, 'endpoint');
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

/**
 * Transforms the error type in a Result
 * @template T The success type
 * @template E The original error type
 * @template F The new error type
 * @param result The result to transform
 * @param mapper A function that maps E to F
 * @returns A New Result with the transformed error
 * @example
 * ```typescript
 * const result = await tryCatch(fetchUser, '123');
 * const mappedErr = mapErr(result, err => new AppError(err.message));
 * ```
 */
export function mapErr<T, E extends Error, F extends Error>(
  result: Result<T, E>,
  mapper: (error: E) => F
): Result<T, F> {
  if (!result.success) {
    const transformedError = mapper(result.error.raw);

    return Result.failure({
      raw: transformedError,
      message: transformedError.message,
      code:
        "code" in transformedError
          ? (transformedError.code as ErrorCode)
          : CommonErrorCodes.UNKNOWN,
    });
  }
  return Result.success(result.data);
}

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

export function recoverWithDefault<T, E extends Error>(
  result: Result<T, E>,
  defaultValue: T
): SuccessResult<T> {
  if (result.success) {
    return Result.success(result.data);
  }
  return Result.success(defaultValue);
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
 * @example
 * ```typescript
 * const result = await tryCatch(fetchUser, '123');
 *
 * // Transform both success and error cases
 * const transformed = mapBoth(
 *   result,
 *   user => ({ ...user, displayName: `${user.firstName} ${user.lastName}` }),
 *   err => new AppError(`Failed to fetch user: ${err.message}`)
 * );
 * ```
 */
export function mapBoth<T, U, E extends Error, F extends Error>(
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
      code:
        "code" in transformedError
          ? (transformedError.code as ErrorCode)
          : CommonErrorCodes.UNKNOWN,
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
 * This is a more robust version of mapBoth that handles errors thrown during mapping.
 * Unlike the simpler mapBoth, this version:
 * - Properly propagates and types errors thrown in the mappers
 * - Supports async operations in the mappers
 * - Provides more detailed typing for complex transformations
 *
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, '123');
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
 * const result = await mapBothWithMappers(
 *   userResult,
 *   formatUser,
 *   convertToAppError
 * );
 *
 * // Type system knows about all possible error types
 * // Result<FormattedUser, AppError | FormatError | ConversionError>
 * ```
 */
export async function mapBothWithMappers<
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
    const mappingResult = await tryCatch(
      asyncFn<MS>()(async () => Promise.resolve(successMapper.fn(result.data)))
    );

    if (mappingResult.success) {
      return Result.success(mappingResult.data); // U
    } else {
      return Result.failure(mappingResult.error); // ResultError<MS>
    }
  } else {
    const mappingResult = await tryCatch(
      asyncFn<ME>()(async () =>
        Promise.resolve(errorMapper.fn(result.error.raw))
      )
    );

    if (mappingResult.success) {
      const transformedError = mappingResult.data;
      return Result.failure({
        raw: transformedError,
        message: transformedError.message,
        code:
          "code" in transformedError
            ? (transformedError.code as ErrorCode)
            : CommonErrorCodes.UNKNOWN,
      });
    } else {
      return Result.failure(mappingResult.error);
    }
  }
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
 * This function is useful for side effects like logging or analytics
 * without disrupting the Result chain. The side effect function:
 * - SHOULD NOT throw exceptions (they will be caught and ignored)
 * - SHOULD NOT modify the data (it's passed by reference)
 * - CAN perform async operations, but they WON'T be awaited
 *
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, '123');
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
 * This function is useful for side effects like error logging
 * without disrupting the Result chain. The side effect function:
 * - SHOULD NOT throw exceptions (they will be caught and ignored)
 * - SHOULD NOT modify the error (it's passed by reference)
 * - CAN perform async operations, but they WON'T be awaited
 *
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, '123');
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
 * const configResult = await tryCatch(fetchConfig, "app");
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
 *   const userResult = await tryCatch(fetchUser, '123');
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
 * @param promise The promise to convert
 * @returns A Promise that resolves to a Result
 *
 * @remarks
 * This is useful when working with external Promise-based APIs
 * and you want to integrate them into your Result-based error handling.
 * The error type will be the type of whatever the Promise rejects with.
 *
 * @example
 * ```typescript
 * // Working with a third-party API that returns Promises
 * const userPromise = externalApi.getUser('123');
 *
 * // Convert to a Result for consistent error handling
 * const userResult = await fromPromise(userPromise);
 *
 * // Now you can use all your Result utilities
 * const safeUser = recover.sync(userResult, { name: 'Guest' });
 * ```
 */
export async function fromPromise<T, E extends Error = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  return tryCatch(asyncFn<E>()(async () => promise));
}

/**
 * Collects results from multiple operations, grouping successes and failures
 * @template T The success type
 * @template E The error type
 * @param results Array of Results to collect
 * @returns A Result containing either all success values or a special CollectedErrors object
 *
 * @example
 * ```typescript
 * const results = [
 *   await tryCatch(fetchUser, '123'),
 *   await tryCatch(fetchUser, '456'),
 *   await tryCatch(fetchUser, '789')
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
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, '123');
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
      code: CommonErrorCodes.UNKNOWN,
    });
  }
  return result;
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
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, "123");
 *
 * // Parse the user's data synchronously
 * const parsedResult = mapResultSync(
 *   userResult,
 *   user => ({ ...user, age: parseInt(user.ageString) })
 * );
 *
 * if (parsedResult.success) {
 *   console.log(`User is ${parsedResult.data.age} years old`);
 * }
 * ```
 */
export function mapResultSync<T, U, E extends Error, M extends Error = E>(
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
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, "123");
 *
 * // Synchronously validate and transform user data
 * const validatedResult = flatMapResultSync(
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
export function flatMapResultSync<
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
