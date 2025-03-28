/**
 * Utility functions for checking and narrowing error types
 */

/**
 * Type guard to safely check if an error is of a specific custom error class
 * @template T The target error class type
 * @param err The error to check
 * @param errorClass The error class constructor
 * @returns A boolean indicating if the error is of the specified type, with type narrowing
 * @example
 * ```typescript
 * if (isErrorType(error, NetworkError)) {
 *   // error is narrowed to NetworkError instance
 *   console.log(error.data.url);
 * }
 * ```
 */
export function isErrorType<T extends Error>(
  err: Error,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorClass: new (...args: any[]) => T
): err is T {
  return err instanceof errorClass;
}

/**
 * Creates a type guard function for a specific error class.
 * @template T The error class type (extends Error)
 * @param errorClass The constructor of the error class to check against
 * @returns A type guard function that narrows an Error to type T
 * @example
 * ```typescript
 * const isNetworkError = createErrorTypeGuard(NetworkError);
 * const error: Error = new NetworkError("Connection failed");
 * if (isNetworkError(error)) {
 *   // error is narrowed to NetworkError instance
 *   console.log(error.data.url);
 * }
 * ```
 */
export function createErrorTypeGuard<T extends Error>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorClass: new (...args: any[]) => T
): (err: Error) => err is T {
  return (err: Error): err is T => err instanceof errorClass;
}

/**
 * Creates a type guard function constrained to a specific error union type.
 * @template E The union of possible error types
 * @template T The specific error type to check (must be in E)
 * @param errorClass The constructor of the error class to check against
 * @param _checkTypes Optional phantom parameter that forces TypeScript to verify T is part of E
 * @returns A type guard function that narrows E to T
 * @example
 * ```typescript
 * class ApiError extends Error { data = { status: 500 }; }
 * class FormatError extends Error { data = { reason: "Invalid" }; }
 * type AppError = ApiError | FormatError;
 *
 * const isApiError = createConstrainedErrorGuard<AppError, ApiError>(ApiError);
 * const error: AppError = new ApiError("API failed");
 * if (isApiError(error)) {
 *   // error is narrowed to ApiError
 *   console.log(error.data.status); // Accesses status safely
 * }
 *
 * // This would cause a compile error because NetworkError is not in AppError union:
 * // const isWrong = createConstrainedErrorGuard<AppError, NetworkError>(NetworkError);
 * ```
 */
export function createConstrainedErrorGuard<E extends Error, T extends E>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errorClass: new (...args: any[]) => T,
  // This phantom parameter helps TypeScript verify the constraint at compile time
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _checkTypes?: T extends E ? { type: T; union: E } : never
): (err: E) => err is T {
  return (err: E): err is T => err instanceof errorClass;
}

/**
 * Checks if an error has a specific name property
 * This can be useful when instanceof doesn't work in some contexts
 * @param err The error to check
 * @param name The error name to match
 * @returns A boolean indicating if the error has the specified name
 */
export function hasErrorName(err: Error, name: string): boolean {
  if (!err || typeof err !== "object") return false;
  return err.name === name;
}

/**
 * Type guard that checks if an object has a specific property
 * Useful for checking if an error has a specific data property
 * @template T The object type
 * @template K The property name (as string)
 * @param obj The object to check
 * @param prop The property name
 * @returns A boolean indicating if the object has the specified property
 */
export function hasProperty<T extends object, K extends string>(
  obj: T,
  prop: K
): obj is T & Record<K, unknown> {
  if (!obj || typeof obj !== "object") return false;
  return prop in obj;
}
