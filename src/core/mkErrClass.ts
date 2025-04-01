import { ErrorCode, CommonErrorCodes } from "./ErrorCode";

/**
 * A strongly typed error with a unique `name` literal type.
 */
export type NamedError<
  T = Record<string, never>,
  Name extends string = string
> = Error & {
  name: Name;
  code: ErrorCode;
  data: T;
};

/**
 * Defines the return type of an error class.
 * @template Name The unique error name
 * @template T The additional error data
 */
type ErrorClassReturn<T, Name extends string = string> = new (
  message: string,
  options?: { code?: ErrorCode; data?: T }
) => NamedError<T, Name>;

/**
 * Creates a custom error class without additional typed properties
 * @param name The name of the error class
 * @param defaultCode The default error code
 * @returns A custom error class
 */
export function mkErrClass<Name extends string>(
  name: Name,
  defaultCode: ErrorCode
): ErrorClassReturn<Record<string, never>, Name>;

/**
 * Creates a custom error class with additional typed properties
 * @template Name The name of the error class
 * @template T The type of additional properties
 * @param name The name of the error class
 * @param defaultCode The default error code
 * @param defaultData The default data to use when no data is provided (required)
 * @returns A custom error class
 */
export function mkErrClass<T extends object, Name extends string>(
  name: Name,
  defaultCode: ErrorCode,
  defaultData: T
): ErrorClassReturn<T, Name>;

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
export function mkErrClass<
  T extends object = Record<never, never>,
  Name extends string = string
>(
  name: Name,
  defaultCode?: ErrorCode,
  defaultData?: T
): ErrorClassReturn<T, Name> {
  return class CustomError extends Error {
    public readonly name: Name = name;
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
