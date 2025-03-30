/* eslint-disable @typescript-eslint/no-unused-vars */
import { CommonErrorCodes, ErrorCode } from "../core/ErrorCode";
import {
  Result as ResultType,
  ResultError,
  Success as SuccessType,
  Failure as FailureType,
} from "../types/Result";
import {
  getErrorCode,
  normalizeError,
  normalizeTypedError,
} from "./normalizeError";
import { AsyncFnWithErr } from "../core/AsyncFnWithErr";
import { SyncFnWithErr } from "../core/SyncFnWithErr";
import { tryCatchAsync, tryCatch } from "../core/tryCatch";
import { MapperFn } from "./mapperFn";
import { asyncFn } from "../core/asyncFn";

// Type to help with unused type parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoInfer<T> = [T][T extends any ? 0 : never];

/**
 * Success class that allows method chaining for Result transformations
 */
export class Success<T> implements SuccessType<T> {
  readonly success = true as const;

  constructor(public readonly data: T) {}

  /**
   * Maps the success value to a new value synchronously
   */
  map<U>(fn: (data: T) => U): ChainableResult<U, never> {
    try {
      return new Success(fn(this.data));
    } catch (err) {
      // ideally this should not be reach (fn) should throw err but it's a precaution
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Maps the success value to a new value asynchronously
   */
  async mapAsync<U>(
    fn: (data: T) => Promise<U>
  ): Promise<ChainableResult<U, never>> {
    try {
      const result = await fn(this.data);
      return new Success(result);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Maps the success value using a MapperFn that can return typed errors
   */
  async mapWithMapper<U, M extends Error>(
    mapper: MapperFn<T, U, M>
  ): Promise<ChainableResult<U, M>> {
    try {
      const result = mapper.fn(this.data);
      // Check if the result is a Promise and await it if necessary
      const resolvedResult = result instanceof Promise ? await result : result;
      return new Success(resolvedResult);
    } catch (err) {
      return new Failure(normalizeError<M>(err));
    }
  }

  /**
   * Ignores mapErr operations
   */
  mapErr<F extends Error = never>(): ChainableResult<T, never> {
    return this;
  }

  /**
   * Transform both success and error values (no-op for Success)
   */
  transformBoth<U, F extends Error = never>(
    successMapper: (data: T) => U,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _errorMapper?: (error: unknown) => F
  ): ChainableResult<U, F> {
    return this.map(successMapper) as ChainableResult<U, F>;
  }

  /**
   * Chains with another Result-returning function synchronously
   */
  flatMap<U, F extends Error>(
    fn: (data: T) => ChainableResult<U, F>
  ): ChainableResult<U, F> {
    try {
      return fn(this.data);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Chains with an async Result-returning function
   */
  async flatMapAsync<U, F extends Error>(
    fn: (data: T) => Promise<ChainableResult<U, F>>
  ): Promise<ChainableResult<U, F>> {
    try {
      return await fn(this.data);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Chains with a MapperFn that returns a Result
   */
  flatMapWithMapper<U, F extends Error, M extends Error>(
    mapper: MapperFn<T, ResultType<U, F>, M>
  ): ChainableResult<U, F | M> {
    try {
      const innerResult = mapper.fn(this.data);

      if (innerResult instanceof Promise) {
        throw new Error(
          "Expected synchronous Result, but got Promise<Result>. Use flatMapResult for async operations."
        );
      }

      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } catch (err) {
      return new Failure(normalizeError<M>(err));
    }
  }

  /**
   * Chains with a MapperFn that returns a Promise Result
   */
  async flatMapWithMapperAsync<U, F extends Error, M extends Error>(
    mapper: MapperFn<T, ResultType<U, F>, M>
  ): Promise<ChainableResult<U, F | M>> {
    try {
      const innerResult = await mapper.fn(this.data);

      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } catch (err) {
      return new Failure(normalizeError<M>(err));
    }
  }

  /**
   * Ignores recoverWithResult operations
   */
  recoverWithResult<
    R = NoInfer<never>,
    F extends Error = never
  >(): ChainableResult<T, never> {
    return this;
  }

  /**
   * Ignores recoverWithResultAsync operations
   */
  async recoverWithResultAsync<
    R = NoInfer<never>,
    F extends Error = never
  >(): Promise<ChainableResult<T, never>> {
    return this;
  }

  /**
   * Filters the success value with a predicate
   */
  filter<E extends Error>(
    predicate: (data: T) => boolean,
    errorFn: (data: T) => E
  ): ChainableResult<T, E> {
    if (!predicate(this.data)) {
      const error = errorFn(this.data);
      return new Failure(normalizeTypedError(error)) as Failure<E>;
    }
    return this as Success<T>;
  }

  /**
   * Runs a side effect function on the success value
   */
  tap(fn: (data: T) => void): ChainableResult<T, never> {
    try {
      fn(this.data);
    } catch (err) {
      console.warn("Error in tap function:", err);
    }
    return this;
  }

  /**
   * Ignores tapError operations
   */
  tapError(): ChainableResult<T, never> {
    return this;
  }

  /**
   * Combines with other results into a tuple
   */
  combine<U, E extends Error>(
    other: ChainableResult<U, E>
  ): ChainableResult<[T, U], E> {
    if (!other.success) {
      return new Failure(other.error);
    }
    return new Success([this.data, other.data]);
  }

  /**
   * Combines with multiple other results into an array
   */
  combineAll<U, E extends Error>(
    others: ChainableResult<U, E>[]
  ): ChainableResult<[T, ...U[]], E> {
    const values: U[] = [];

    for (const result of others) {
      if (!result.success) {
        return new Failure(result.error);
      }
      values.push(result.data);
    }

    return new Success([this.data, ...values]);
  }

  /**
   * Gets the value or returns a default
   */
  getOrElse(): T {
    return this.data;
  }

  /**
   * Converts to a promise
   */
  toPromise(): Promise<T> {
    return Promise.resolve(this.data);
  }

  /**
   * Converts to a standard Result
   */
  toResult(): ResultType<T, never> {
    return { success: true, data: this.data };
  }
}

/**
 * Failure class that allows method chaining for Result transformations
 */
export class Failure<E extends Error> implements FailureType<E> {
  readonly success = false as const;

  constructor(public readonly error: ResultError<E>) {}

  /**
   * Ignores map operations
   */
  map<U = NoInfer<never>>(): ChainableResult<never, E> {
    return this;
  }

  /**
   * Ignores mapAsync operations
   */
  async mapAsync<U = NoInfer<never>>(): Promise<ChainableResult<never, E>> {
    return this;
  }

  /**
   * Maps the error value to a new error type (renamed from mapErr)
   */
  mapErr<F extends Error>(fn: (error: E) => F): ChainableResult<never, F> {
    try {
      const transformedError = fn(this.error.raw);
      return new Failure(normalizeTypedError(transformedError));
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Handles errors with a synchronous recovery function
   */
  recoverWithResult<R, F extends Error>(
    handler: (error: ResultError<E>) => ChainableResult<R, F>
  ): ChainableResult<R, F> {
    try {
      return handler(this.error);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * Handles errors with a asynchronous recovery function
   */
  async recoverWithResultAsync<R, F extends Error>(
    handler: (error: ResultError<E>) => Promise<ChainableResult<R, F>>
  ): Promise<ChainableResult<R, F>> {
    try {
      return await handler(this.error);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  }

  /**
   * No-op for filter on failures
   */
  filter<F extends Error = never>(): ChainableResult<never, E> {
    return this;
  }

  /**
   * Ignores tap operations
   */
  tap(): ChainableResult<never, E> {
    return this;
  }

  /**
   * Runs a side effect function on the error value
   */
  tapError(fn: (error: ResultError<E>) => void): ChainableResult<never, E> {
    try {
      fn(this.error);
    } catch (err) {
      console.warn("Error in tapError function:", err);
    }
    return this;
  }

  /**
   * Always fails when combining with other results
   */
  combine<_U = never, _F extends Error = never>(): ChainableResult<never, E> {
    return this;
  }

  /**
   * Always fails when combining with multiple other results
   */
  combineAll<_U = never, _F extends Error = never>(): ChainableResult<
    never,
    E
  > {
    return this;
  }

  /**
   * Gets the default value
   */
  getOrElse<T>(defaultValue: T): T {
    return defaultValue;
  }

  /**
   * Converts to a rejected promise
   */
  toPromise<T>(): Promise<T> {
    return Promise.reject(this.error.raw);
  }

  /**
   * Converts to a standard Result
   */
  toResult<T>(): ResultType<T, E> {
    return { success: false, error: this.error };
  }

  /**
   * Ignores flatMap operations
   */
  flatMap<U = NoInfer<never>, F extends Error = never>(): ChainableResult<
    never,
    E
  > {
    return this;
  }

  /**
   * Ignores flatMapAsync operations
   */
  async flatMapAsync<U = NoInfer<never>, F extends Error = never>(): Promise<
    ChainableResult<never, E>
  > {
    return this;
  }
}

/**
 * Union type representing either Success or Failure
 */
export type ChainableResult<T, E extends Error = Error> =
  | Success<T>
  | Failure<E>;

/**
 * Factory functions for creating chainable Results
 */
export const ChainableResult = {
  /**
   * Creates a Success result
   */
  success<T>(data: T): Success<T> {
    return new Success(data);
  },

  /**
   * Creates a Failure result
   */
  failure<E extends Error>(error: ResultError<E>): Failure<E> {
    return new Failure(error);
  },

  /**
   * Creates a Failure result from an Error
   */
  fromError<E extends Error>(error: E): Failure<E> {
    return new Failure({
      raw: error,
      message: error.message,
      code: getErrorCode(error),
    });
  },

  /**
   * Converts a standard Result to a ChainableResult
   */
  fromResult<T, E extends Error>(
    result: ResultType<T, E>
  ): ChainableResult<T, E> {
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  },

  /**
   * Converts a Promise to a ChainableResult
   */
  async fromPromise<T, E extends Error = Error>(
    promise: Promise<T>,
    errorFactory?: (error: unknown) => E
  ): Promise<ChainableResult<T, E>> {
    try {
      const data = await promise;
      return new Success(data);
    } catch (err) {
      if (errorFactory) {
        const typedError = errorFactory(err);
        return new Failure(normalizeTypedError(typedError));
      }

      return new Failure(normalizeError<E>(err));
    }
  },

  /**
   * Maps a Result using a simple function synchronously
   */
  map<T, U, E extends Error>(
    result: ResultType<T, E>,
    fn: (data: T) => U
  ): ChainableResult<U, E> {
    const chainable = ChainableResult.fromResult(result);
    return chainable.success
      ? (chainable as Success<T>).map(fn)
      : (chainable as Failure<E>);
  },

  /**
   * Maps a Result using a simple function asynchronously
   */
  async mapAsync<T, U, E extends Error>(
    result: ResultType<T, E>,
    fn: (data: T) => Promise<U>
  ): Promise<ChainableResult<U, E>> {
    const chainable = ChainableResult.fromResult(result);
    if (chainable.success) {
      return await (chainable as Success<T>).mapAsync(fn);
    }
    return chainable as Failure<E>;
  },

  /**
   * Transform both success and error values
   */
  transformBoth<T, U, E extends Error, F extends Error>(
    result: ResultType<T, E>,
    successMapper: (data: T) => U,
    errorMapper: (error: E) => F
  ): ChainableResult<U, F> {
    const chainable = ChainableResult.fromResult(result);
    if (chainable.success) {
      return (chainable as Success<T>).map(successMapper) as ChainableResult<
        U,
        F
      >;
    } else {
      return (chainable as Failure<E>).mapErr(errorMapper);
    }
  },

  /**
   * Combines multiple Results into a single Result
   */
  combine<T extends unknown[], E extends Error>(
    ...results: { [K in keyof T]: ChainableResult<T[K], E> }
  ): ChainableResult<T, E> {
    if (results.length === 0) {
      return new Success([] as unknown as T);
    }

    // Start with the first result
    const combined: ChainableResult<unknown[], E> = results[0].success
      ? new Success([results[0].data])
      : results[0];

    // Combine with the rest
    for (let i = 1; i < results.length; i++) {
      if (!combined.success) {
        return combined as ChainableResult<T, E>;
      }

      const next = results[i];
      if (!next.success) {
        return next as ChainableResult<T, E>;
      }

      // Push to the array of successful values
      (combined as Success<unknown[]>).data.push(next.data);
    }

    return combined as ChainableResult<T, E>;
  },

  /**
   * Executes a wrapped function with tryCatch and returns a ChainableResult
   */
  async tryCatchAsync<T, E extends Error, Args extends readonly unknown[]>(
    wrappedFn: AsyncFnWithErr<T, E, Args>,
    ...args: Args
  ): Promise<ChainableResult<T, E>> {
    const result = await tryCatchAsync(wrappedFn, ...args);
    return ChainableResult.fromResult(result);
  },

  /**
   * Executes a wrapped synchronous function with tryCatch and returns a ChainableResult
   */
  tryCatch<T, E extends Error, Args extends readonly unknown[]>(
    wrappedFn: SyncFnWithErr<T, E, Args>,
    ...args: Args
  ): ChainableResult<T, E> {
    const result = tryCatch(wrappedFn, ...args);
    return ChainableResult.fromResult(result);
  },

  /**
   * Runs a side effect function on success data without changing the Result
   */
  tap<T, E extends Error>(
    result: ResultType<T, E>,
    fn: (data: T) => void
  ): ChainableResult<T, E> {
    const chainable = ChainableResult.fromResult(result);
    return chainable.success ? chainable.tap(fn) : chainable;
  },

  /**
   * Runs a side effect function on error without changing the Result
   */
  tapError<T, E extends Error>(
    result: ResultType<T, E>,
    fn: (error: ResultError<E>) => void
  ): ChainableResult<T, E> {
    const chainable = ChainableResult.fromResult(result);
    return !chainable.success
      ? (chainable as Failure<E>).tapError(fn)
      : chainable;
  },

  /**
   * Filters a success Result by applying a predicate
   */
  filter<T, E extends Error, F extends Error>(
    result: ResultType<T, E>,
    predicate: (data: T) => boolean,
    errorFn: (data: T) => F
  ): ChainableResult<T, E | F> {
    const chainable = ChainableResult.fromResult(result);
    return chainable.success
      ? chainable.filter(predicate, errorFn)
      : (chainable as Failure<E>);
  },

  /**
   * Applies a MapperFn to transform a success value with proper error handling
   */
  async mapWithMapper<T, U, E extends Error, M extends Error>(
    result: ResultType<T, E>,
    mapper: MapperFn<T, U, M>
  ): Promise<ChainableResult<U, E | M>> {
    const chainable = ChainableResult.fromResult(result);
    if (!chainable.success) {
      return chainable as unknown as ChainableResult<U, E>;
    }

    try {
      const wrappedFn = asyncFn<M>()(async () => mapper.fn(chainable.data));
      const mapped = await tryCatchAsync(wrappedFn);

      if (mapped.success) {
        return new Success(mapped.data);
      } else {
        return new Failure(mapped.error);
      }
    } catch (err) {
      return new Failure(normalizeError<M>(err));
    }
  },

  /**
   * Applies a function that returns a Result synchronously
   */
  flatMap<T, U, E extends Error, F extends Error>(
    result: ResultType<T, E>,
    fn: (data: T) => ResultType<U, F>
  ): ChainableResult<U, E | F> {
    const chainable = ChainableResult.fromResult(result);
    if (!chainable.success) {
      return chainable as unknown as ChainableResult<U, E>;
    }

    try {
      const innerResult = fn(chainable.data);
      return ChainableResult.fromResult(innerResult);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  },

  /**
   * Applies a function that returns a Result asynchronously
   */
  async flatMapAsync<T, U, E extends Error, F extends Error>(
    result: ResultType<T, E>,
    fn: (data: T) => Promise<ResultType<U, F>>
  ): Promise<ChainableResult<U, E | F>> {
    const chainable = ChainableResult.fromResult(result);
    if (!chainable.success) {
      return chainable as unknown as ChainableResult<U, E>;
    }

    try {
      const innerResult = await fn(chainable.data);
      return ChainableResult.fromResult(innerResult);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  },

  /**
   * Recovers from errors by transforming them or providing fallback data
   */
  recoverWithResult<T, R, E extends Error, F extends Error>(
    result: ResultType<T, E>,
    handler: (error: ResultError<E>) => ResultType<R, F>
  ): ChainableResult<T | R, F> {
    const chainable = ChainableResult.fromResult(result);
    if (chainable.success) {
      return chainable as ChainableResult<T, never>;
    }

    try {
      const innerResult = handler((chainable as Failure<E>).error);
      return ChainableResult.fromResult(innerResult);
    } catch (err) {
      return new Failure(normalizeError(err));
    }
  },

  /**
   * Extracts the success value or returns a default value
   */
  getOrElse<T, E extends Error>(result: ResultType<T, E>, defaultValue: T): T {
    const chainable = ChainableResult.fromResult(result);
    return chainable.success ? chainable.data : defaultValue;
  },

  /**
   * Converts a Result to a Promise
   */
  resultToPromise<T, E extends Error>(result: ResultType<T, E>): Promise<T> {
    const chainable = ChainableResult.fromResult(result);
    return chainable.toPromise();
  },

  /**
   * Converts a Promise to a Result
   */
  promiseToResult<T, E extends Error = Error>(
    promise: Promise<T>
  ): Promise<ChainableResult<T, E>> {
    return ChainableResult.fromPromise(promise);
  },

  /**
   * Applies a MapperFn that returns a Result
   */
  async flatMapWithMapperAsync<
    T,
    U,
    E extends Error,
    F extends Error,
    M extends Error
  >(
    result: ResultType<T, E>,
    mapper: MapperFn<T, ResultType<U, F>, M>
  ): Promise<ChainableResult<U, E | F | M>> {
    const chainable = ChainableResult.fromResult(result);
    if (!chainable.success) {
      return chainable;
    }

    try {
      const promiseResult = mapper.fn(chainable.data);
      const innerResult = await promiseResult;

      return ChainableResult.fromResult(innerResult);
    } catch (err) {
      return new Failure(normalizeError<M>(err));
    }
  },

  /**
   * Transforms both success and error values using MapperFn objects
   */
  async transformBothWithMappersAsync<
    T,
    U,
    E extends Error,
    F extends Error,
    MS extends Error = never,
    ME extends Error = never
  >(
    result: ResultType<T, E>,
    successMapper: MapperFn<T, U, MS>,
    errorMapper: MapperFn<E, F, ME>
  ): Promise<ChainableResult<U, F | MS | ME>> {
    const chainable = ChainableResult.fromResult(result);

    if (chainable.success) {
      try {
        const mappedValue = await Promise.resolve(
          successMapper.fn(chainable.data)
        );
        return new Success(mappedValue);
      } catch (err) {
        return new Failure(normalizeError<MS>(err));
      }
    } else {
      try {
        const rawError = chainable.error.raw;
        const mappedError = await Promise.resolve(errorMapper.fn(rawError));
        return new Failure({
          raw: mappedError,
          message: mappedError.message,
          code: getErrorCode(mappedError),
        });
      } catch (err) {
        return new Failure(normalizeError<ME>(err));
      }
    }
  },
};
