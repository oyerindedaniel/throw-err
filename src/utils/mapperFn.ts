/**
 * A wrapper for mapper functions that may throw errors of type M
 * This class preserves the type information of both the return value
 * and the potential error types, similar to AsyncFnWithErr
 * @template T The input type
 * @template U The output type
 * @template M The error type that may be thrown
 */
export class MapperFn<T, U, M extends Error> {
  /**
   * @param fn The mapper function to wrap
   */
  constructor(public fn: (data: T) => Promise<U> | U) {}

  /**
   * The type of error that may be thrown by this mapper
   * This property is never actually used at runtime, it only exists for type information
   */
  readonly _errorType?: M;
}

/**
 * Creates a MapperFn instance for a given mapper function, specifying the error type M
 * @template M The error type that may be thrown
 * @returns A function that wraps the provided mapper function
 * @example
 * ```typescript
 * const parseJson = mapperFn<ParseError>()((text: string) => {
 *   try {
 *     return JSON.parse(text);
 *   } catch (err) {
 *     throw new ParseError('Failed to parse JSON');
 *   }
 * });
 * ```
 */
export function mapperFn<M extends Error>() {
  return <T, U>(fn: (data: T) => Promise<U> | U): MapperFn<T, U, M> => {
    return new MapperFn<T, U, M>(fn);
  };
}
