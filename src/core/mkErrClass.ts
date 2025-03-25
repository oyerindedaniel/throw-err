import { ErrorCode, CommonErrorCodes } from "./ErrorCode";

type ErrorClassReturn<T> = new (
  message: string,
  options?: { code?: ErrorCode; data?: T }
) => Error & {
  name: string;
  code: ErrorCode;
  data: T;
};

/**
 * Creates a custom error class without additional typed properties
 * @param name The name of the error class
 * @param defaultCode The default error code
 * @returns A custom error class
 */
export function mkErrClass(
  name: string,
  defaultCode?: ErrorCode
): ErrorClassReturn<Record<string, never>>;

/**
 * Creates a custom error class with additional typed properties
 * @template T The type of additional properties
 * @param name The name of the error class
 * @param defaultCode The default error code
 * @param defaultData The default data to use when no data is provided (required)
 * @returns A custom error class
 */
export function mkErrClass<T extends object>(
  name: string,
  defaultCode: ErrorCode | undefined,
  defaultData: T
): ErrorClassReturn<T>;

/**
 * Implementation of mkErrClass
 * @example
 * ```typescript
 * interface ApiErrorData {
 *   status: number;
 *   url: string;
 * }
 *
 * // When providing a type with properties, default data is required
 * const ApiError = mkErrClass<ApiErrorData>(
 *   'ApiError',
 *   'API_ERROR',
 *   { status: 0, url: '' }
 * );
 *
 * // Simple error without additional data doesn't need defaults
 * const SimpleError = mkErrClass('SimpleError', 'SIMPLE_ERROR');
 * ```
 */
export function mkErrClass<T extends object = Record<string, never>>(
  name: string,
  defaultCode?: ErrorCode,
  defaultData?: T
): ErrorClassReturn<T> {
  return class CustomError extends Error {
    public readonly name: string = name;
    public readonly code: ErrorCode;
    public readonly data: T;

    constructor(message: string, options?: { code?: ErrorCode; data?: T }) {
      super(message);
      this.code = options?.code ?? defaultCode ?? CommonErrorCodes.UNKNOWN;
      this.data = options?.data ?? (defaultData as T);

      // This is needed for proper instanceof checks in transpiled ES5 code
      Object.setPrototypeOf(this, CustomError.prototype);
    }
  };
}
