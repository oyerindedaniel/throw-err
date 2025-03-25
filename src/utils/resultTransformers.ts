import { Result, ExtractResultError } from "../types/Result";
import { ErrorCode } from "../core/ErrorCode";
import { MapperFn } from "./mapperFn";
import { tryCatch } from "../core/tryCatch";
import { asyncFn } from "../core/asyncFn";

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
    return result;
  }

  const mappingResult = await tryCatch(
    asyncFn<M>()(async () => mapper.fn(result.data))
  );

  if (mappingResult.success) {
    return { success: true, data: mappingResult.data };
  } else {
    return {
      success: false,
      error: mappingResult.error,
    };
  }
}

/**
 * Chains operations where the mapper returns a Result
 * @template T The original success type
 * @template U The transformed success type
 * @template E The original error type
 * @template F The mapper's result error type
 * @template M The mapper function's possible error type
 * @param result The original result
 * @param mapper A MapperFn that maps T to Result<U, F> (can itself throw errors of type M)
 * @returns A result that combines all possible error types
 * @example
 * ```typescript
 * const userResult = await tryCatch(fetchUser, "123");
 *
 * // Create a mapper with DatabaseError as the error type
 * const fetchPosts = mapperFn<DatabaseError>()((user) => {
 *   if (!user.id) throw new DatabaseError("Cannot process user without ID");
 *   return tryCatch(fetchUserPosts, user.id);
 * });
 *
 * // Type safety is maintained without explicit type parameters
 * const postsResult = await flatMapResult(userResult, fetchPosts);
 *
 * // Type system knows all three possible error types
 * if (!postsResult.success) {
 *   if (isErrorType(postsResult.error.raw, FetchError)) {
 *     // Original error from userResult
 *   } else if (isErrorType(postsResult.error.raw, NotFoundError)) {
 *     // Error from the nested tryCatch in fetchPosts
 *   } else if (isErrorType(postsResult.error.raw, DatabaseError)) {
 *     // Error thrown by the mapper function itself
 *     console.log(`Database error: ${postsResult.error.raw.table}`);
 *   }
 * }
 * ```
 */
export async function flatMapResult<T, U, E extends Error, M extends Error = E>(
  result: Result<T, E>,
  mapper: MapperFn<T, Result<U, E | M>, M>
): Promise<Result<U, E | M>> {
  if (!result.success) {
    return result;
  }

  const mappingResult = await tryCatch(
    asyncFn<M>()(async () => mapper.fn(result.data))
  );

  if (mappingResult.success) {
    return mappingResult.data;
  } else {
    return {
      success: false,
      error: mappingResult.error,
    };
  }
}

/**
 * Recovers from errors by transforming them or providing fallback data
 * @template T The original success type
 * @template R The recovery success type (can be different from T)
 * @template E The original error type
 * @template F The new error type
 * @param result The result to transform
 * @param handler A function that maps E to Result<R, F>
 * @returns A new Result with either the original value, recovery value, or a new error
 * @example
 * ```typescript
 * const result = await tryCatch(fetchUser, '123');
 * // Recover with same type
 * const recovered = await catchErr(result, () => ({
 *   success: true,
 *   data: { id: '123', name: 'Guest User' }  // User type
 * }));
 *
 * // Or recover with different type
 * const basicInfo = await catchErr(result, () => ({
 *   success: true,
 *   data: { name: 'Guest' }  // BasicUserInfo type
 * }));
 * ```
 */
export async function catchErr<T, R, E extends Error, F extends Error>(
  result: Result<T, E>,
  handler: (
    error: ExtractResultError<Result<T, E>>
  ) => Promise<Result<R, F>> | Result<R, F>
): Promise<Result<T | R, F>> {
  if (!result.success) {
    const handlerFn = asyncFn<F>()(async () => {
      return await handler(result.error);
    });

    const handlerResult = await tryCatch(handlerFn);

    if (handlerResult.success) {
      return handlerResult.data;
    } else {
      return {
        success: false,
        error: handlerResult.error,
      };
    }
  }

  return result as Result<T | R, F>;
}

/**
 * Transforms the error type in a Result
 * @template T The success type
 * @template E The original error type
 * @template F The new error type
 * @param result The result to transform
 * @param mapper A function that maps E to F
 * @returns A new Result with the transformed error
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
    return {
      success: false,
      error: {
        raw: transformedError,
        message: transformedError.message,
        code:
          "code" in transformedError
            ? (transformedError as { code: ErrorCode }).code
            : "UNKNOWN",
      },
    };
  }
  return result as Result<T, F>;
}
