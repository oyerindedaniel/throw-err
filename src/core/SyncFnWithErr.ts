/**
 * A wrapper for synchronous functions that may throw errors of type E
 * @template T The return type of the wrapped function
 * @template E The error type that may be thrown
 * @template Args The argument types of the wrapped function
 */
export class SyncFnWithErr<
  T,
  E extends Error,
  Args extends readonly unknown[]
> {
  constructor(public fn: (...args: Args) => T) {}

  /**
   * Type marker for the error type (for type information only)
   */
  readonly _errorType?: E;
}
