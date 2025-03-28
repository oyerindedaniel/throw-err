import { ErrorCode } from "../core/ErrorCode";

/**
 * Represents an error result with metadata
 */
export type ResultError<E extends Error = Error> = {
  message: string;
  raw: E;
  code: ErrorCode;
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
   */
  success<T>(data: T): SuccessResult<T> {
    return { success: true, data };
  },

  /**
   * Create a failure result
   */
  failure<E extends Error>(error: ResultError<E>): ErrorResult<E> {
    return { success: false, error };
  },

  /**
   * Unwrap a result, returning the data or throwing the error
   */
  unwrap<T, E extends Error>(result: Result<T, E>): T {
    if (result.success) {
      return result.data;
    }
    throw result.error.raw;
  },

  /**
   * Map a success result to a new value
   */
  map<T, U, E extends Error>(
    result: Result<T, E>,
    fn: (data: T) => U
  ): Result<U, E> {
    if (result.success) {
      return { success: true, data: fn(result.data) };
    }
    return result;
  },

  /**
   * Returns the success data from a Result or undefined if it's an error
   * Unlike unwrap, this never throws
   */
  getData<T, E extends Error>(result: Result<T, E>): T | undefined {
    return result.success ? result.data : undefined;
  },

  /**
   * Returns the error from a Result or undefined if it's a success
   * Unlike unwrap, this never throws
   */
  getError<T, E extends Error>(
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
