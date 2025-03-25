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
 * Represents the result of an operation that can either succeed with data
 * or fail with a typed error
 */
export type Result<T, E extends Error = Error> =
  | { success: true; data: T; error?: undefined }
  | { success: false; error: ResultError<E>; data?: undefined };

/**
 * Helper functions for working with Result types
 */
export const Result = {
  /**
   * Create a success result
   */
  success<T>(data: T): Result<T, never> {
    return { success: true, data };
  },

  /**
   * Create a failure result
   */
  failure<E extends Error>(error: ResultError<E>): Result<never, E> {
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
};

/**
 * Extracts the non-undefined error type from a Result type
 * Used in places where we've already checked result.success === false
 */
export type ExtractResultError<R extends Result<unknown, Error>> =
  R extends Result<unknown, infer E> ? ResultError<E> : never;
