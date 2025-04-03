import { ErrorCode, CommonErrorCodes } from "../core/ErrorCode";
import { ResultError } from "../types/Result";

/**
 * Normalizes any error into a consistent ResultError format.
 * Handles various input types:
 * - ResultError objects (returned as is to avoid double wrapping)
 * - Error objects (converted to ResultError)
 * - Custom errors with code/data properties
 * - Non-error objects/primitives (wrapped in Error)
 *
 * @param error Any error value to normalize
 * @returns A normalized ResultError object
 */
export function normalizeError<E extends Error = Error>(
  error: unknown
): ResultError<E> {
  // Already a ResultError - return as is to avoid double wrapping
  if (isResultError(error)) {
    return error as ResultError<E>;
  }

  // Regular Error object
  if (error instanceof Error) {
    const typedError = error as E;
    return {
      raw: typedError,
      stack: typedError.stack,
      message: typedError.message,
      code: getErrorCode(typedError),
      
    };
  }

  // Non-Error value - wrap in Error
  const wrappedError = new Error(
    typeof error === "string" ? error : `Unknown error: ${String(error)}`
  ) as E;

  return {
    raw: wrappedError,
    message: wrappedError.message,
    stack: wrappedError.stack,
    code: CommonErrorCodes.UNKNOWN,
  };
}

/**
 * Type-safe version of normalizeError that preserves the specific error type
 * when the input is known to be of a specific error class
 */
export function normalizeTypedError<T extends Error>(error: T): ResultError<T> {
  return {
    raw: error,
    message: error.message,
    stack: error.stack,
    code: getErrorCode(error),
  };
}

/**
 * Checks if an object is a ResultError (has raw property that's an Error)
 */
export function isResultError(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "raw" in obj &&
    obj.raw instanceof Error &&
    "message" in obj
  );
}

/**
 * Extracts error code from different types of errors
 */
export function getErrorCode(error: Error): ErrorCode {
  if ("code" in error && typeof error.code === "string") {
    return error.code as ErrorCode;
  }

  // Strictly typed custom error name
  if (
    "name" in error &&
    typeof error.name === "string" &&
    error.name !== "Error"
  ) {
    return error.name;
  }

  return CommonErrorCodes.UNKNOWN;
}
