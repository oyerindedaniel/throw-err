import { ErrorCode } from "../core/ErrorCode";
import { normalizeTypedError } from "../utils/normalizeError";

/**
 * Represents an error result with metadata
 */
export type ResultError<E extends Error = Error> = {
  /** The error message */
  message: string;
  /** The original error object */
  raw: E;
  /** The error code used for categorization */
  code: ErrorCode;
  /** The error name (typically the class name) */
  name?: string;
  /** The stack trace (if available) */
  stack?: string;
  /** The error that caused this error (if any) */
  cause?: ResultError<Error>;
};

/**
 * Represents a successful result with data
 * @template T The type of data contained in the successful result
 */
export type Success<T> = {
  success: true;
  data: T;
  error?: undefined;
};

/**
 * Represents a failed result with an error
 * @template E The specific error type contained in the result
 */
export type Failure<E extends Error = Error> = {
  success: false;
  error: ResultError<E>;
  data?: undefined;
};

/**
 * Represents the result of an operation that can either succeed with data
 * or fail with a typed error.
 *
 * @template T The success data type
 * @template E The error type (must extend Error)
 */
export type Result<T, E extends Error = Error> = Success<T> | Failure<E>;


/**
 * Helper functions for working with Result types
 */
export const Result = {
  /**
   * Create a success result
   * @template T The success data type
   * @param data The data to wrap in a success result
   * @returns A properly typed SuccessResult<T>
   *
   * @example
   * ```typescript
   * // Create a success result with user data
   * const userResult = Result.success({ id: '123', name: 'Alice' });
   *
   * // Use the result in a function expecting Result<User, Error>
   * processUserResult(userResult);
   * ```
   */
  success<T>(data: T): SuccessResult<T> {
    return { success: true, data };
  },

  /**
   * Create a failure result from a ResultError object
   * @template E The error type
   * @param error The ResultError object containing the error details
   * @returns A properly typed ErrorResult<E>
   *
   * @remarks
   * This method expects a pre-formatted ResultError object. For creating a failure
   * directly from an Error instance, use Result.fromError instead.
   *
   * @example
   * ```typescript
   * // Create a failure result with a formatted error
   * const errorResult = Result.failure({
   *   raw: new NotFoundError("User not found"),
   *   message: "User not found",
   *   code: "NOT_FOUND"
   * });
   * ```
   */
  failure<E extends Error>(error: ResultError<E>): ErrorResult<E> {
    return { success: false, error };
  },

  /**
   * Create a failure result directly from an Error instance
   * @template E The error type
   * @param error The Error instance to convert to a failure result
   * @returns A properly formatted ErrorResult<E>
   *
   * @remarks
   * This is a convenience method that automatically normalizes the error object
   * using normalizeTypedError, so you don't have to manually format the ResultError.
   *
   * @example
   * ```typescript
   * // Create a failure result directly from an Error
   * try {
   *   const data = JSON.parse(invalidJson);
   *   return Result.success(data);
   * } catch (err) {
   *   // Automatically normalize the error
   *   return Result.fromError(new ParseError("Invalid JSON", { cause: err }));
   * }
   * ```
   */
  fromError<E extends Error>(error: E): ErrorResult<E> {
    return { success: false, error: normalizeTypedError(error) };
  },

  /**
   * Unwrap a result, returning the data or throwing the error
   * @template T The success data type
   * @template E The error type
   * @param result The result to unwrap
   * @returns The success data if the result is successful
   * @throws The raw error if the result is a failure
   *
   * @remarks
   * This is a dangerous operation that should be used carefully.
   * Only use it when you're sure the result is a success, or when
   * you want to convert a Result into a try/catch pattern.
   *
   * @example
   * ```typescript
   * try {
   *   // This will throw if the result is a failure
   *   const user = Result.unwrap(userResult);
   *   console.log(`Found user: ${user.name}`);
   * } catch (err) {
   *   console.error("Failed to unwrap result:", err);
   * }
   * ```
   */
  unwrap<T, E extends Error>(result: Result<T, E>): T {
    if (result.success) {
      return result.data;
    }
    throw result.error.raw;
  },

  /**
   * Unwrap a result's error, returning the error or throwing if it's a success
   * @template T The success data type
   * @template E The error type
   * @param result The result to unwrap the error from
   * @returns The ResultError<E> if the result is a failure
   * @throws Error If the result is a success
   *
   * @remarks
   * This is the opposite of unwrap. It's used when you're certain
   * the result is a failure and want to extract the error details.
   *
   * @example
   * ```typescript
   * try {
   *   // This will throw if the result is a success
   *   const error = Result.unwrapErr(errorResult);
   *   console.error(`Operation failed: ${error.message} (${error.code})`);
   * } catch (err) {
   *   console.log("The result was unexpectedly successful");
   * }
   * ```
   */
  unwrapErr<T, E extends Error>(result: Result<T, E>): ResultError<E> {
    if (!result.success) {
      return result.error;
    }
    throw new Error("Cannot unwrap error from a success result");
  },

  /**
   * Safely unwrap a result, returning either the data or undefined if it's an error
   * @template T The success data type
   * @template E The error type
   * @param result The result to safely unwrap
   * @returns The success data or undefined if the result is a failure
   *
   * @remarks
   * Unlike unwrap, this method never throws an error, making it safe
   * to use in situations where you want to handle the absence of data.
   *
   * @example
   * ```typescript
   * // Safely get the user or use a default if not found
   * const user = Result.safeUnwrap(userResult) || { name: 'Guest' };
   * console.log(`Hello, ${user.name}`);
   * ```
   */
  safeUnwrap<T, E extends Error>(result: Result<T, E>): T | undefined {
    return result.success ? result.data : undefined;
  },

  /**
   * Map a success result to a new value
   * @template T The original success data type
   * @template U The new success data type
   * @template E The error type
   * @param result The result to map
   * @param fn A function that transforms T to U
   * @returns A new Result with either the transformed value or the original error
   *
   * @remarks
   * This method only transforms the success value and passes through any errors.
   * Note that if the mapping function throws, the exception is not caught.
   * For safer mapping with error handling, use transformers from resultTransformers.ts.
   *
   * @example
   * ```typescript
   * // Map a user result to just the user's name
   * const nameResult = Result.map(
   *   userResult,
   *   user => user.name
   * );
   *
   * // If userResult is a failure, nameResult will be that same failure
   * // If userResult is a success, nameResult will contain the user's name
   * ```
   */
  map<T, U, E extends Error>(
    result: Result<T, E>,
    fn: (data: T) => U
  ): Result<U, E> {
    if (result.success) {
      return Result.success(fn(result.data));
    }
    return result;
  },

  /**
   * Returns the error from a Result or undefined if it's a success
   * @template T The success data type
   * @template E The error type
   * @param result The result to extract error from
   * @returns The ResultError<E> or undefined if the result is a success
   *
   * @remarks
   * This is the counterpart to safeUnwrap and provides a safe way to
   * access the error information without throwing.
   *
   * @example
   * ```typescript
   * // Get error details if operation failed
   * const error = Result.safeUnwrapErr(operationResult);
   * if (error) {
   *   if (error.code === 'NETWORK') {
   *     showNetworkErrorMessage(error.message);
   *   } else {
   *     showGenericErrorMessage(error.message);
   *   }
   * }
   * ```
   */
  safeUnwrapErr<T, E extends Error>(
    result: Result<T, E>
  ): ResultError<E> | undefined {
    return result.success ? undefined : result.error;
  },
};

/**
 * Extracts the non-undefined error type from a Result type
 * Used in places where we've already checked result.success === false
 */
export type ExtractResultError<R extends Result<unknown, Error>> =
  R extends Result<unknown, infer E> ? ResultError<E> : never;

/**
 * Represents a successful result with data
 * @template T The type of data contained in the successful result
 *
 * This is a more specific type than the full Result union type,
 * guaranteeing that:
 * - `success` is always true
 * - `data` is always present (never undefined)
 *
 * Use this type as a return value when you know an operation will never fail
 * or when handling errors is done internally (like in recover functions).
 */
export type SuccessResult<T> = Success<T>;

/**
 * Represents a failed result with an error
 * @template E The specific error type contained in the result
 *
 * This is a more specific type than the full Result union type,
 * guaranteeing that:
 * - `success` is always false
 * - `error` is always present (never undefined)
 *
 * Use this type as a return value when you know an operation will always fail
 * or when handling a failure branch specifically.
 */
export type ErrorResult<E extends Error> = Failure<E>;
