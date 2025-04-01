import {
  Result,
  ExtractResultError,
  SuccessResult,
  ResultError,
} from "../types/Result";
import { MapperFn, MapperFnAsync } from "./mapperFn";
import { tryCatch, tryCatchAsync } from "../core/tryCatch";
import { asyncFn } from "../core/asyncFn";
import { normalizeError, normalizeTypedError } from "../utils/normalizeError";
import { syncFn } from "../core/syncFn";
import { CollectedErrors } from "./customErrors";

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

  const mappingResult = tryCatch(syncFn<E>()(() => fn(result.data)));

  if (mappingResult.success) {
    return Result.success(mappingResult.data);
  } else {
    return Result.failure(mappingResult.error);
  }
}

/**
 * Asynchronous map function that transforms the success value of a Result.
 *
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template M The additional error type that may arise from the async mapper function
 *
 * @param result The result to transform
 * @param mapper An async function that maps T to U
 * @returns A Promise resolving to a new Result with either the transformed value or the original/normalized error
 *
 * @remarks
 * - Use this function when:
 *   - You need to transform a success value asynchronously.
 *   - The mapping function has a **low chance** of introducing a new error.
 *   - You want to ensure the error type remains unchanged.
 * - If the async mapper function could introduce a **new type of error**, consider using `mapWithMapperAsync` instead.
 *
 * Unlike `map`, this function supports asynchronous transformations. If the `mapper` function rejects or throws,
 * the error is normalized and returned as a `Result.failure`.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123'); // Result<User, FetchError>
 *
 * // Transform the user data asynchronously to fetch additional details
 * const detailedUserResult = await mapAsync(
 *   userResult,
 *   async user => await fetchUserDetails(user.id)
 * );
 * ```
 */
export async function mapAsync<T, U, E extends Error>(
  result: Result<T, E>,
  mapper: (data: T) => Promise<U>
): Promise<Result<U, E>> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  const mappingResult = await tryCatchAsync(
    asyncFn<E>()(async () => mapper(result.data))
  );

  if (mappingResult.success) {
    return Result.success(mappingResult.data);
  } else {
    return Result.failure(mappingResult.error);
  }
}

/**
 * Transforms the success value of a `Result` while handling potential errors from the transformation.
 *
 * @template T The original success type.
 * @template U The transformed success type.
 * @template E The original error type.
 * @template M The mapper error type.
 *
 * @param result The `Result` to transform.
 * @param mapper A `MapperFn` instance that maps `T` to `U`, which may throw an error of type `M`.
 * @returns A new `Result` with either the transformed value or one of the possible error types (`E | M`).
 *
 * @remarks
 * - Use this function when:
 *   - You need to transform success values synchronously while handling potential errors.
 *   - The transformation **might throw specific errors** that should be properly captured.
 *   - You want strong type safety by using a `MapperFn` for structured error handling.
 * - For **asynchronous transformations**, use `mapWithAsync` instead.
 *
 * @example
 * ```typescript
 * const numberResult: Result<string, Error> = Result.success("42");
 *
 * const parseNumber = MapperFn<string, number, SyntaxError>()((text) => {
 *   const num = Number(text);
 *   if (isNaN(num)) throw new SyntaxError("Invalid number");
 *   return num;
 * });
 *
 * const transformedResult = mapWith(numberResult, parseNumber);
 * ```
 */
export function mapWith<T, U, E extends Error, M extends Error = E>(
  result: Result<T, E>,
  mapper: MapperFn<T, U, M>
): Result<U, E | M> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  const mappingResult = tryCatch(syncFn<M>()(() => mapper.fn(result.data)));

  if (mappingResult.success) {
    return Result.success(mappingResult.data); // U
  } else {
    return Result.failure(mappingResult.error); // M
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
 * @param mapper A MapperFnAsync instance that maps T to U (can throw errors of type M)
 * @returns A new Result with either the transformed value or either of the error types
 *
 * @remarks
 * Use this function when:
 * - You need to transform success values with proper error handling
 * - Your transformation might throw specific errors you want to catch
 * - You want to leverage the type-safety of MapperFnAsync
 *
 * This provides more robust error handling than map or mapAsync because it
 * works with MapperFnAsync to properly type potential errors from the transformation.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Create a mapper with ParseError as the error type
 * const parseJson = MapperFnAsync<ParseError>()((text: string) => {
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
export async function mapWithAsync<
  T,
  U,
  E extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: MapperFnAsync<T, U, M>
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
 * This is particularly useful when error transformation involves asynchronous
 * operations, such as logging or fetching additional error details. For a more
 * sophisticated error handling approach that allows recovery with new success
 * values, see `recover` (synchronous).
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(fetchUser, '123');
 *
 * // Convert network errors to application errors
 * const appResult = mapErr(
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
export function mapErr<T, E extends Error, F extends Error>(
  result: Result<T, E>,
  mapper: (error: E) => F
): Result<T, F> {
  if (!result.success) {
    const transformedError = mapper(result.error.raw);
    return Result.failure(normalizeTypedError(transformedError));
  }
  return Result.success(result.data);
}

/**
 * Transforms the error type in a Result (asynchronous version)
 * @template T The success type
 * @template E The original error type
 * @template F The new error type
 * @param result The result to transform
 * @param mapper An async function that maps E to F
 * @returns A Promise resolving to a new Result with the transformed error
 *
 * @remarks
 * Use this function when:
 * - You need to convert error types for API boundaries with async operations
 * - You want to add additional context to errors via async lookups
 * - You're standardizing errors across different operations asynchronously
 *
 * This is particularly useful when error transformation involves asynchronous
 * operations, such as logging or fetching additional error details. For a more
 * sophisticated error handling approach that allows recovery with new success
 * values, see `recoverAsync` (asynchronous).
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(fetchUser, '123');
 *
 * // Asynchronously convert network errors to application errors with details
 * const appResult = await mapErrAsync(
 *   result,
 *   async err => {
 *     if (isErrorType(err, NetworkError)) {
 *       const details = await fetchErrorDetails(err.code);
 *       return new AppError(`Connection issue: ${err.message} - ${details}`);
 *     }
 *     return new AppError(`Unknown error: ${err.message}`);
 *   }
 * );
 * // Type: Result<User, AppError>
 * ```
 */
export async function mapErrAsync<T, E extends Error, F extends Error>(
  result: Result<T, E>,
  mapper: (error: E) => Promise<F>
): Promise<Result<T, F>> {
  if (!result.success) {
    const transformedError = await mapper(result.error.raw);
    return Result.failure(normalizeTypedError(transformedError));
  }
  return Result.success(result.data);
}

/**
 * Synchronously applies a MapperFnAsync that returns a Result
 * @template T The original success type
 * @template U The success type of the inner Result
 * @template E The original error type
 * @template F The error type of the inner Result
 * @template M The mapper's thrown error type
 * @param result The original Result
 * @param mapper A MapperFnSsync that maps T to Result<U, F> (can itself throw errors of type M)
 * @returns A new Result combining all possible error types
 *
 * @remarks
 * This is the synchronous version of flatMapWithAsync. Use this when
 * the mapper function doesn't need to perform async operations.
 *
 * @example
 * ```typescript
 * const userResult = tryCatchSync(parseUserSync, userJson);
 *
 * // Create a mapper that returns a Result
 * const validateUser = MapperFn<ValidationError>()((user) => {
 *   if (!user.email) {
 *     return Result.fromError(new ValidationError("Email required"));
 *   }
 *   return Result.success(user);
 * });
 *
 * // Map with proper error typing
 * const validatedResult = flatMapWith(userResult, validateUser);
 * ```
 */
export function flatMapWith<
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

  const mappingResult = tryCatch(syncFn<M>()(() => mapper.fn(result.data)));

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
 * Chains operations where the mapper returns a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The mapper's result error type (inferred from inner Result)
 * @template M The mapper function's possible error type
 * @param result The original result
 * @param mapper A MapperFnAsync that maps T to Result<U, F> (can itself throw errors of type M)
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
 * const fetchPosts = MapperFnAsync<DatabaseError>()((user) => {
 *   if (!user.id) throw new DatabaseError("Cannot process user without ID");
 *   return tryCatchAsync(fetchUserPosts, user.id); // Result<Post[], NotFoundError>
 * });
 *
 * // Type safety is maintained, F is inferred as NotFoundError
 * const postsResult = await flatMapWithAsync(userResult, fetchPosts);
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
export async function flatMapWithAsync<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: MapperFnAsync<T, Result<U, F>, M>
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
 * Recovers from errors by transforming them or providing fallback data (synchronous version)
 * @template T The original success type
 * @template R The recovery success type
 * @template E The original error type
 * @template F The handler's result error type
 * @template M The handler's thrown error type
 * @param result The original result
 * @param mapper A MapperFn that maps an error of type E to Result<R, F> and may throw M
 * @returns A new Result with combined success and error types
 *
 * @remarks
 * Use this function when:
 * - You need sophisticated error recovery without async operations
 * - Your recovery logic might produce new errors
 * - You want to maintain type safety throughout
 *
 * This is the synchronous counterpart to recoverAsync, designed for cases where
 * recovery logic doesn't involve asynchronous operations.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Define a synchronous mapper to recover from certain errors
 * const recoverMapper = mapperFn<AppError>()((error) => {
 *   if (isErrorType(error.raw, NotFoundError)) {
 *     return Result.success({ id: '123', name: 'Guest User' } as User);
 *   }
 *   return Result.failure(new AppError(`User fetch failed: ${error.message}`));
 * });
 *
 * const safeResult = recover(userResult, recoverMapper);
 * // Type: Result<User, AppError>
 * ```
 */
export function recover<
  T,
  R,
  E extends Error,
  F extends Error,
  M extends Error = F
>(
  result: Result<T, E>,
  mapper: MapperFn<ExtractResultError<Result<T, E>>, Result<R, F>, M>
): Result<T | R, F | M> {
  if (!result.success) {
    const handlerResult = tryCatch(syncFn<M>()(() => mapper.fn(result.error)));
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
 * Recovers from errors by transforming them or providing fallback data (asynchronous version)
 * @template T The original success type
 * @template R The recovery success type
 * @template E The original error type
 * @template F The handler's result error type
 * @template M The handler's thrown error type
 * @param result The original result
 * @param mapper A MapperFnAsync that maps an error of type E to Result<R, F> and may throw M
 * @returns A Promise resolving to a new Result with combined success and error types
 *
 * @remarks
 * Use this function when:
 * - You need sophisticated error recovery with async operations
 * - Your recovery logic might produce new errors
 * - You want to maintain type safety throughout
 *
 * This is the asynchronous counterpart to recover, allowing recovery
 * paths that involve asynchronous operations and produce typed errors.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Try fetching from cache if network fails
 * const cachedFetch = MapperFnAsync<CacheError>()((error) => {
 *   if (isErrorType(error.raw, NetworkError)) {
 *     return fetchFromCache('user-123'); // Returns Result<User, CacheError>
 *   }
 *   throw new AppError("Unrecoverable error");
 * });
 *
 * const finalResult = await recoverAsync(userResult, cachedFetch);
 * // Type: Result<User, CacheError | AppError>
 * ```
 */
export async function recoverAsync<
  T,
  R,
  E extends Error,
  F extends Error,
  M extends Error = F
>(
  result: Result<T, E>,
  mapper: MapperFnAsync<ExtractResultError<Result<T, E>>, Result<R, F>, M>
): Promise<Result<T | R, F | M>> {
  if (!result.success) {
    const handlerResult = await tryCatchAsync(
      asyncFn<M>()(async () => Promise.resolve(mapper.fn(result.error)))
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
 * - For complex error handling, consider using `recover` instead
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 * const safeUser = orElse(userResult, { name: 'Guest User' });
 * ```
 */
export function orElse<T, R, E extends Error>(
  result: Result<T, E>,
  fallback: R | ((error: ExtractResultError<Result<T, E>>) => R)
): SuccessResult<T | R> {
  if (result.success) {
    return Result.success(result.data);
  }

  if (typeof fallback === "function") {
    const fn = fallback as (error: ExtractResultError<Result<T, E>>) => R;
    const fallbackResult = tryCatch(syncFn<Error>()(() => fn(result.error)));

    if (fallbackResult.success) {
      return Result.success(fallbackResult.data);
    } else {
      // Fallback to empty object if function throws
      return Result.success({} as R);
    }
  }

  return Result.success(fallback);
}

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
 * - For complex error handling, consider using `recoverAsync` instead
 *
 * @example
 * ```typescript
 * const dataResult = await tryCatchAsync(fetchData, 'endpoint');
 * const processedData = await orElseAsync(dataResult, async (err) => {
 *   const cachedData = await getCachedData();
 *   return { ...cachedData, fromCache: true };
 * });
 * ```
 */
export async function orElseAsync<T, R, E extends Error>(
  result: Result<T, E>,
  fallback:
    | R
    | Promise<R>
    | ((error: ExtractResultError<Result<T, E>>) => R | Promise<R>)
): Promise<SuccessResult<T | R>> {
  if (result.success) {
    return Promise.resolve(Result.success(result.data));
  }

  if (typeof fallback === "function") {
    const fn = fallback as (
      error: ExtractResultError<Result<T, E>>
    ) => R | Promise<R>;
    const fallbackResult = await tryCatchAsync(
      asyncFn<Error>()(async () => fn(result.error))
    );

    if (fallbackResult.success) {
      return Result.success(fallbackResult.data);
    } else {
      return Result.success({} as R);
    }
  }

  // Handle non-function fallbacks (values or promises)
  const resolveResult = await tryCatchAsync(
    asyncFn<Error>()(async () => Promise.resolve(fallback))
  );

  if (resolveResult.success) {
    return Result.success(resolveResult.data);
  } else {
    return Result.success({} as R);
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
 * Unlike combineAll which fails fast on the first error,
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
 *   console.error(`${collected.error.raw.data.errors.length} operations failed`);
 *   collected.error.raw.data.errors.forEach(err =>
 *     console.error(err.message)
 *   );
 * }
 * ```
 */
export function collectResults<T, E extends Error>(
  results: Result<T, E>[]
): Result<T[], InstanceType<typeof CollectedErrors>> {
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
    : Result.failure(
        normalizeTypedError(
          new CollectedErrors(`${errors.length} operation(s) failed`, {
            data: { errors },
          })
        )
      );
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
 * const validUserResult = filter(
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
export function filter<T, E extends Error>(
  result: Result<T, E>,
  predicate: (data: T) => boolean,
  errorFn: (data: T) => E
): Result<T, E> {
  if (result.success && !predicate(result.data)) {
    const error = errorFn(result.data);
    return Result.failure(normalizeTypedError(error));
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
    // We don't care about the result of the tap function, just if it throws
    tryCatch(syncFn<Error>()(() => fn(result.data)));
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
 * const result = tapErr(userResult, err => {
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
export function tapErr<T, E extends Error>(
  result: Result<T, E>,
  fn: (error: ResultError<E>) => void
): Result<T, E> {
  if (!result.success) {
    // We don't care about the result of the tap function, just if it throws
    tryCatch(syncFn<Error>()(() => fn(result.error)));
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
 * Unlike orElse which returns a Result, this
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
 *     if (isErrorType(err, Error) && err.message.includes("network")) {
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
  const result = await tryCatchAsync(asyncFn<Error>()(async () => promise));

  if (result.success) {
    return Result.success(result.data);
  } else {
    if (errorFactory) {
      // Use the custom error factory to convert the error
      const typedError = errorFactory(result.error.raw);
      return Result.failure(normalizeTypedError(typedError));
    }
    // Default error handling - since we're using Error type for the asyncFn, we need to cast
    return Result.failure(normalizeError<E>(result.error.raw));
  }
}

/**
 * Synchronously apples a mapper that returns a Result
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
 * - Your mapper function returns another Result
 *
 * This is the synchronous counterpart to flatMapAsync.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Synchronously validate and transform user data
 * const validatedResult = flatMap(
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
export function flatMap<
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

  const mappingResult = tryCatch(syncFn<M>()(() => mapper(result.data)));

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
 *  Asynchronously apples a mapper that returns a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The mapper's result error type
 * @template M The mapper function's possible error type
 * @param result The original result
 * @param mapper A function that maps T to Promise<Result<U, F>> (can throw errors of type M)
 * @returns A result that combines all possible error types
 *
 * @remarks
 * Use this function when:
 * - Your mapper function returns a Promise of a Result
 * - You want proper error typing across the async operation
 *
 * This is the asynchronous counterpart to flatMap.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, "123");
 *
 * // Asynchronously validate and transform user data
 * const validatedResult = await flatMapAsync(
 *   userResult,
 *   async user => {
 *     const isValid = await validateUserAsync(user);
 *     if (!isValid) return Result.failure({
 *       raw: new ValidationError("User validation failed"),
 *       message: "User validation failed",
 *       code: CommonErrorCodes.VALIDATION
 *     });
 *     return Result.success({ ...user, validated: true });
 *   }
 * );
 * ```
 */
export async function flatMapAsync<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error = E
>(
  result: Result<T, E>,
  mapper: (data: T) => Promise<Result<U, F>>
): Promise<Result<U, E | F | M>> {
  if (!result.success) {
    return Result.failure(result.error); // Error type E
  }

  const mappingResult = await tryCatchAsync(
    asyncFn<M>()(async () => mapper(result.data))
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
 * Combines multiple Results into a single Result
 * @template T The success data type for each Result
 * @template E The error type for each Result
 * @param results An array of Results to combine
 * @returns A Result containing an array of success values if all Results succeeded,
 *          or the first failure encountered
 *
 * @remarks
 * Use this function when:
 * - You need to process multiple Results together
 * - You want a "fail-fast" behavior (stops at the first failure)
 * - You want to collect all success values into a single array
 *
 * Unlike `collectResults` which gathers all errors, this function returns
 * immediately upon encountering the first failure.
 *
 * @example
 * ```typescript
 * const nameResult = Result.success("Alice");
 * const ageResult = Result.success(30);
 * const emailResult = Result.success("alice@example.com");
 *
 * const combined = combineAll([nameResult, ageResult, emailResult]);
 * // Result<string[], Error>
 *
 * if (combined.success) {
 *   const [name, age, email] = combined.data;
 *   createUser({ name, age, email });
 * } else {
 *   handleError(combined.error);
 * }
 * ```
 */
export function combineAll<T, E extends Error>(
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


/**
 * Waits for multiple Result Promises to resolve and combines them
 * @template T The success data type for each Result
 * @template E The error type for each Result
 * @param promises An array of Promises that resolve to Results
 * @returns A Promise of a Result containing an array of success values if all Results succeeded,
 *          or the first failure encountered
 *
 * @remarks
 * Use this function when:
 * - You have multiple async operations returning Results
 * - You want to wait for all of them to complete
 * - You want to collect all success values into a single array
 * - You want a "fail-fast" behavior for errors
 *
 * This function awaits all promises using Promise.all before combining them,
 * so all async operations run concurrently.
 *
 * @example
 * ```typescript
 * const userPromise = tryCatchAsync(fetchUser, "123");
 * const postsPromise = tryCatchAsync(fetchPosts, "123");
 * const commentsPromise = tryCatchAsync(fetchComments, "123");
 *
 * const result = await sequenceResults([
 *   userPromise,
 *   postsPromise,
 *   commentsPromise
 * ]);
 *
 * if (result.success) {
 *   const [user, posts, comments] = result.data;
 *   renderProfile({ user, posts, comments });
 * } else {
 *   showError(result.error.message);
 * }
 * ```
 */
export async function sequenceResults<T, E extends Error>(
  promises: Promise<Result<T, E>>[]
): Promise<Result<T[], E>> {
  const results = await Promise.all(promises);
  return combineAll(results);
}

/**
 * Maps both success and error values of a Result (synchronously)
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
 * const result = await tryCatch(fetchUser, '123');
 *
 * // Transform both success and error cases
 * const transformed = transform(
 *   result,
 *   user => ({ ...user, displayName: `${user.firstName} ${user.lastName}` }),
 *   err => new AppError(`Failed to fetch user: ${err.message}`)
 * );
 * ```
 */
export function transform<T, U, E extends Error, F extends Error>(
  result: Result<T, E>,
  successMapper: (data: T) => U,
  errorMapper: (error: E) => F
): Result<U, F> {
  if (result.success) {
    const mappingResult = tryCatch(
      syncFn<F>()(() => successMapper(result.data))
    );

    if (mappingResult.success) {
      return Result.success(mappingResult.data);
    } else {
      return Result.failure(mappingResult.error);
    }
  } else {
    const mappingResult = tryCatch(
      syncFn<F>()(() => errorMapper(result.error.raw))
    );

    if (mappingResult.success) {
      return Result.failure(normalizeTypedError(mappingResult.data));
    } else {
      return Result.failure(mappingResult.error);
    }
  }
}

/**
 * Maps both success and error values of a Result asynchronously
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The transformed error type
 * @param result The result to transform
 * @param successMapper An async function that maps T to U
 * @param errorMapper An async function that maps E to F
 * @returns A Promise resolving to a new Result with transformed success or error values
 *
 * @remarks
 * Use this function when:
 * - You need to transform both success and error values with async operations
 * - The transformations are simple and unlikely to throw complex errors
 * - You want to process both paths in a single operation
 *
 * This is the asynchronous version of transform, useful when transformations
 * require asynchronous operations like API calls or database lookups.
 *
 * @example
 * ```typescript
 * const result = await tryCatchAsync(fetchUser, '123');
 *
 * // Transform both success and error cases asynchronously
 * const transformed = await transformAsync(
 *   result,
 *   async user => {
 *     const details = await fetchUserDetails(user.id);
 *     return { ...user, details, displayName: `${user.firstName} ${user.lastName}` };
 *   },
 *   async err => {
 *     const errorLog = await logError(err);
 *     return new AppError(`Failed to fetch user (log: ${errorLog.id}): ${err.message}`);
 *   }
 * );
 * ```
 */
export async function transformAsync<
  T,
  U,
  E extends Error,
  F extends Error
>(
  result: Result<T, E>,
  successMapper: (data: T) => Promise<U>,
  errorMapper: (error: E) => Promise<F>
): Promise<Result<U, F>> {
  if (result.success) {
    const mappingResult = await tryCatchAsync(
      asyncFn<F>()(async () => successMapper(result.data))
    );

    if (mappingResult.success) {
      return Result.success(mappingResult.data);
    } else {
      return Result.failure(mappingResult.error);
    }
  } else {
    const mappingResult = await tryCatchAsync(
      asyncFn<F>()(async () => errorMapper(result.error.raw))
    );

    if (mappingResult.success) {
      const transformedError = mappingResult.data;
      return Result.failure(normalizeTypedError(transformedError));
    } else {
      return Result.failure(mappingResult.error);
    }
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
 * - You need to transform both success and error values synchronously
 * - Your transformations might throw errors themselves
 * - You need comprehensive type safety
 *
 * This is a more robust version of transform that handles errors thrown during mapping.
 * For async transformations, use transformWithAsync instead.
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
 *   if (isErrorType(err, NetworkError)) {
 *     throw new ConversionError("Cannot convert network errors");
 *   }
 *   return new AppError(`Failed to process user: ${err.message}`);
 * });
 *
 * // Get a Result with comprehensive error typing
 * const result = transformWith(
 *   userResult,
 *   formatUser,
 *   convertToAppError
 * );
 *
 * // Type system knows about all possible error types
 * // Result<FormattedUser, AppError | FormatError | ConversionError>
 * ```
 */
export function transformWith<
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
): Result<U, F | MS | ME> {
  if (result.success) {
    const mappingResult = tryCatch(
      syncFn<MS>()(() => successMapper.fn(result.data))
    );

    if (mappingResult.success) {
      return Result.success(mappingResult.data); // U
    } else {
      return Result.failure(mappingResult.error); // ResultError<MS>
    }
  } else {
    const mappingResult = tryCatch(
      syncFn<ME>()(() => errorMapper.fn(result.error.raw))
    );

    if (mappingResult.success) {
      const transformedError = mappingResult.data;
      return Result.failure(normalizeTypedError(transformedError));
    } else {
      return Result.failure(mappingResult.error);
    }
  }
}

/**
 * Maps both success and error values of a Result with type-safe error handling (async version)
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The transformed error type
 * @template MS The success mapper error type
 * @template ME The error mapper error type
 * @param result The result to transform
 * @param successMapper A MapperFnAsync instance that maps T to U (can throw errors of type MS)
 * @param errorMapper A MapperFnAsync instance that maps E to F (can throw errors of type ME)
 * @returns A Promise resolving to a new Result with transformed values or error from the mapping process
 *
 * @remarks
 * Use this function when:
 * - You need to transform both success and error values asynchronously
 * - Your transformations might throw errors themselves
 * - You need comprehensive type safety for async operations
 *
 * This is the asynchronous version of transformWith for cases
 * where your mapping functions need to perform async operations.
 *
 * @example
 * ```typescript
 * const userResult = await tryCatchAsync(fetchUser, '123');
 *
 * // Create mappers with proper error typing
 * const formatUser = mapperFnAsync<FormatError>()(async (user) => {
 *   const profile = await fetchUserProfile(user.id);
 *   if (!profile) {
 *     throw new FormatError("Failed to get user profile data");
 *   }
 *   return { ...user, ...profile, displayName: `${user.firstName} ${user.lastName}` };
 * });
 *
 * const convertToAppError = mapperFnAsync<ConversionError>()(async (err) => {
 *   const errorLog = await logError(err);
 *   if (isErrorType(err, NetworkError) {
 *     return new AppError(`Network failure (log: ${errorLog.id}): ${err.message}`);
 *   }
 *   return new AppError(`Failed to process user (log: ${errorLog.id}): ${err.message}`);
 * });
 *
 * // Get a Result with comprehensive error typing
 * const result = await transformWithAsync(
 *   userResult,
 *   formatUser,
 *   convertToAppError
 * );
 * ```
 */
export async function transformWithAsync<
  T,
  U,
  E extends Error,
  F extends Error,
  MS extends Error = never,
  ME extends Error = never
>(
  result: Result<T, E>,
  successMapper: MapperFnAsync<T, U, MS>,
  errorMapper: MapperFnAsync<E, F, ME>
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
      return Result.failure(normalizeTypedError(transformedError));
    } else {
      return Result.failure(mappingResult.error);
    }
  }
}
