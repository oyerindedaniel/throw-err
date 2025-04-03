/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Result as ResultType,
  ResultError,
  SuccessResult,
} from "../types/Result";
import { normalizeError, normalizeTypedError } from "./normalizeError";
import { AsyncFnWithErr } from "../core/AsyncFnWithErr";
import { SyncFnWithErr } from "../core/SyncFnWithErr";
import { tryCatchAsync, tryCatch } from "../core/tryCatch";
import { MapperFn, MapperFnAsync } from "./mapperFn";
import { asyncFn } from "../core/asyncFn";
import { syncFn } from "../core/syncFn";
import { CollectedErrors } from "./customErrors";

/**
 * Union type representing either Success or Failure
 */
export type ChainableResultType<T, E extends Error = Error> =
  | Success<T>
  | Failure<E>;

// Type to help with unused type parameters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NoInfer<T> = [T][T extends any ? 0 : never];

/**
 * Success class that allows method chaining for Result matchations
 */

export class Success<T> {
  readonly success = true as const;

  constructor(public readonly data: T) {}

  /** Maps the success value synchronously */
  map<U>(fn: (data: T) => U): ChainableResultType<U, never> {
    const result = tryCatch(syncFn<Error>()(() => fn(this.data)));
    return result.success
      ? new Success(result.data)
      : (new Failure(result.error) as unknown as ChainableResultType<U, never>);
  }

  /** Maps the success value asynchronously */
  async mapAsync<U>(
    fn: (data: T) => Promise<U>
  ): Promise<ChainableResultType<U, never>> {
    const result = await tryCatchAsync(
      asyncFn<Error>()(async () => fn(this.data))
    );
    return result.success
      ? new Success(result.data)
      : (new Failure(result.error) as unknown as ChainableResultType<U, never>);
  }

  /** Maps the success value with a typed mapper */
  mapWith<U, M extends Error>(
    mapper: MapperFn<T, U, M>
  ): ChainableResultType<U, M> {
    const result = tryCatch(syncFn<M>()(() => mapper.fn(this.data)));
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Maps the success value asynchronously with a typed mapper */
  async mapWithAsync<U, M extends Error>(
    mapper: MapperFnAsync<T, U, M>
  ): Promise<ChainableResultType<U, M>> {
    const result = await tryCatchAsync(
      asyncFn<M>()(async () => mapper.fn(this.data))
    );
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Ignores error mapping */
  mapErr<F extends Error>(): ChainableResultType<T, never> {
    return this;
  }

  /** Maps the error value asynchronously (no-op for Success) */
  async mapErrAsync<F extends Error>(): Promise<ChainableResultType<T, never>> {
    return this;
  }

  /** Chains with a Result-returning function synchronously */
  flatMap<U, F extends Error>(
    fn: (data: T) => ResultType<U, F>
  ): ChainableResultType<U, F> {
    const mappingResult = tryCatch(syncFn<Error>()(() => fn(this.data)));

    if (mappingResult.success) {
      const innerResult = mappingResult.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(mappingResult.error) as unknown as ChainableResultType<
        U,
        F
      >;
    }
  }

  /** Chains with a Result-returning function asynchronously */
  async flatMapAsync<U, F extends Error>(
    fn: (data: T) => Promise<ResultType<U, F>>
  ): Promise<ChainableResultType<U, F>> {
    const mappingResult = await tryCatchAsync(
      asyncFn<Error>()(async () => fn(this.data))
    );

    if (mappingResult.success) {
      const innerResult = mappingResult.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(mappingResult.error) as unknown as ChainableResultType<
        U,
        F
      >;
    }
  }

  /** Chains with a typed mapper returning a Result */
  flatMapWith<U, F extends Error, M extends Error>(
    mapper: MapperFn<T, ResultType<U, F>, M>
  ): ChainableResultType<U, F | M> {
    const result = tryCatch(syncFn<M>()(() => mapper.fn(this.data)));
    if (result.success) {
      const innerResult = result.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(result.error);
    }
  }

  /** Chains with a typed mapper returning a Result asynchronously */
  async flatMapWithAsync<U, F extends Error, M extends Error>(
    mapper: MapperFnAsync<T, ResultType<U, F>, M>
  ): Promise<ChainableResultType<U, F | M>> {
    const result = await tryCatchAsync(
      asyncFn<M>()(async () => mapper.fn(this.data))
    );
    if (result.success) {
      const innerResult = result.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(result.error);
    }
  }

  /** Ignores recovery operations */
  recover<R, F extends Error, M extends Error>(): ChainableResultType<
    T,
    never
  > {
    return this;
  }

  /** Ignores async recovery operations */
  async recoverAsync<R, F extends Error, M extends Error>(): Promise<
    ChainableResultType<T, never>
  > {
    return this;
  }

  /** Provides a fallback value synchronously */
  orElse<R>(
    fallback: R | ((error: ResultError<never>) => R)
  ): ChainableResultType<T | R, never> {
    return this as ChainableResultType<T, never>;
  }

  /** Provides a fallback value asynchronously */
  async orElseAsync<R>(
    fallback: R | Promise<R> | ((error: ResultError<never>) => R | Promise<R>)
  ): Promise<ChainableResultType<T | R, never>> {
    return this as ChainableResultType<T, never>;
  }

  /** Filters the success value */
  filter<E extends Error>(
    predicate: (data: T) => boolean,
    errorFn: (data: T) => E
  ): ChainableResultType<T, E> {
    return predicate(this.data)
      ? this
      : new Failure(normalizeTypedError(errorFn(this.data)));
  }

  /** Performs a side effect on success */
  tap(fn: (data: T) => void): ChainableResultType<T, never> {
    tryCatch(syncFn<Error>()(() => fn(this.data)));
    return this;
  }

  /** Ignores error side effects */
  tapErr(): ChainableResultType<T, never> {
    return this;
  }

  /** Match both success and error values synchronously */
  match<U, F extends Error>(
    successMapper: (data: T) => U,
    _errorMapper?: (error: never) => F
  ): ChainableResultType<U, F> {
    const result = tryCatch(syncFn<F>()(() => successMapper(this.data)));
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Match both success and error values asynchronously */
  async matchAsync<U, F extends Error>(
    successMapper: (data: T) => Promise<U>,
    _errorMapper?: (error: never) => Promise<F>
  ): Promise<ChainableResultType<U, F>> {
    const result = await tryCatchAsync(
      asyncFn<F>()(async () => successMapper(this.data))
    );
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Match with typed mappers synchronously */
  matchWith<U, F extends Error, MS extends Error, ME extends Error>(
    successMapper: MapperFn<T, U, MS>,
    _errorMapper: MapperFn<never, F, ME>
  ): ChainableResultType<U, F | MS | ME> {
    const result = tryCatch(syncFn<MS>()(() => successMapper.fn(this.data)));
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Match with typed mappers asynchronously */
  async matchWithAsync<U, F extends Error, MS extends Error, ME extends Error>(
    successMapper: MapperFnAsync<T, U, MS>,
    _errorMapper: MapperFnAsync<never, F, ME>
  ): Promise<ChainableResultType<U, F | MS | ME>> {
    const result = await tryCatchAsync(
      asyncFn<MS>()(async () => successMapper.fn(this.data))
    );
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /** Combines with another result */
  combine<U, E extends Error>(
    other: ResultType<U, E>
  ): ChainableResultType<[T, U], E> {
    return other.success
      ? new Success([this.data, other.data])
      : new Failure(other.error);
  }

  /** Combines with multiple results */
  combineAll<U, E extends Error>(
    others: ResultType<U, E>[]
  ): ChainableResultType<[T, ...U[]], E> {
    const values: U[] = [];
    for (const result of others) {
      if (!result.success) return new Failure(result.error);
      values.push(result.data);
    }
    return new Success([this.data, ...values]);
  }

  /** Extracts the success value */
  getOrElse(): T {
    return this.data;
  }

  /** Converts to a Promise */
  toPromise(): Promise<T> {
    return Promise.resolve(this.data);
  }

  /** Converts to a standard Result */
  toResult(): SuccessResult<T> {
    return { success: true, data: this.data };
  }
}

/**
 * Failure class for chainable Result matchations
 */
export class Failure<E extends Error> {
  readonly success = false as const;

  constructor(public readonly error: ResultError<E>) {}

  /** Ignores success mapping */
  map<U = NoInfer<never>>(): ChainableResultType<never, E> {
    return this;
  }

  /** Ignores async success mapping */
  async mapAsync<U = NoInfer<never>>(): Promise<ChainableResultType<never, E>> {
    return this;
  }

  /** Ignores typed success mapping */
  mapWith<U, M extends Error>(): ChainableResultType<never, E> {
    return this;
  }

  /** Ignores async typed success mapping */
  async mapWithAsync<U, M extends Error>(): Promise<
    ChainableResultType<never, E>
  > {
    return this;
  }

  /** Maps the error synchronously */
  mapErr<F extends Error>(fn: (error: E) => F): ChainableResultType<never, F> {
    const result = tryCatch(syncFn<Error>()(() => fn(this.error.raw)));
    return new Failure(
      result.success ? normalizeTypedError(result.data) : result.error
    ) as unknown as ChainableResultType<never, F>;
  }

  /** Maps the error asynchronously */
  async mapErrAsync<F extends Error>(
    fn: (error: E) => Promise<F>
  ): Promise<ChainableResultType<never, F>> {
    const result = await tryCatchAsync(
      asyncFn<Error>()(async () => fn(this.error.raw))
    );
    return new Failure(
      result.success ? normalizeTypedError(result.data) : result.error
    ) as unknown as ChainableResultType<never, F>;
  }

  /** Ignores synchronous chaining */
  flatMap<U, F extends Error>(): ChainableResultType<never, E> {
    return this;
  }

  /** Ignores async chaining */
  async flatMapAsync<U, F extends Error>(): Promise<
    ChainableResultType<never, E>
  > {
    return this;
  }

  /** Ignores typed chaining */
  flatMapWith<U, F extends Error, M extends Error>(): ChainableResultType<
    never,
    E
  > {
    return this;
  }

  /** Ignores async typed chaining */
  async flatMapWithAsync<U, F extends Error, M extends Error>(): Promise<
    ChainableResultType<never, E>
  > {
    return this;
  }

  /** Recovers from the error synchronously */
  recover<R, F extends Error, M extends Error>(
    mapper: MapperFn<ResultError<E>, ResultType<R, F>, M>
  ): ChainableResultType<R, F | M> {
    const result = tryCatch(syncFn<M>()(() => mapper.fn(this.error)));
    if (result.success) {
      const innerResult = result.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(result.error);
    }
  }

  /** Recovers from the error asynchronously */
  async recoverAsync<R, F extends Error, M extends Error>(
    mapper: MapperFnAsync<ResultError<E>, ResultType<R, F>, M>
  ): Promise<ChainableResultType<R, F | M>> {
    const result = await tryCatchAsync(
      asyncFn<M>()(async () => mapper.fn(this.error))
    );
    if (result.success) {
      const innerResult = result.data;
      if (innerResult.success) {
        return new Success(innerResult.data);
      } else {
        return new Failure(innerResult.error);
      }
    } else {
      return new Failure(result.error);
    }
  }

  /** Provides a fallback value synchronously */
  orElse<R>(
    fallback: R | ((error: ResultError<E>) => R)
  ): ChainableResultType<R, never> {
    const value =
      typeof fallback === "function"
        ? (fallback as (e: ResultError<E>) => R)(this.error)
        : fallback;
    return new Success(value);
  }

  /** Provides a fallback value asynchronously */
  async orElseAsync<R>(
    fallback: R | Promise<R> | ((error: ResultError<E>) => R | Promise<R>)
  ): Promise<ChainableResultType<R, never>> {
    if (typeof fallback === "function") {
      const result = await tryCatchAsync(
        asyncFn<Error>()(async () =>
          (fallback as (e: ResultError<E>) => Promise<R>)(this.error)
        )
      );
      return new Success(result.success ? result.data : ({} as R));
    }
    const result = await tryCatchAsync(
      asyncFn<Error>()(async () => Promise.resolve(fallback))
    );
    return new Success(result.success ? result.data : ({} as R));
  }

  /** Ignores filtering */
  filter<F extends Error>(): ChainableResultType<never, E> {
    return this;
  }

  /** Ignores success side effects */
  tap(): ChainableResultType<never, E> {
    return this;
  }

  /** Performs a side effect on the error */
  tapErr(fn: (error: ResultError<E>) => void): ChainableResultType<never, E> {
    tryCatch(syncFn<Error>()(() => fn(this.error)));
    return this;
  }

  /** Match both success and error values synchronously */
  match<U, F extends Error>(
    _successMapper: (data: never) => U,
    errorMapper: (error: E) => F
  ): ChainableResultType<U, F> {
    const result = tryCatch(syncFn<Error>()(() => errorMapper(this.error.raw)));
    return result.success
      ? new Failure(normalizeTypedError(result.data))
      : (new Failure(result.error) as unknown as ChainableResultType<U, F>);
  }

  /** Match both success and error values asynchronously */
  async matchAsync<U, F extends Error>(
    _successMapper: (data: never) => Promise<U>,
    errorMapper: (error: E) => Promise<F>
  ): Promise<ChainableResultType<U, F>> {
    const result = await tryCatchAsync(
      asyncFn<Error>()(async () => errorMapper(this.error.raw))
    );
    return result.success
      ? new Failure(normalizeTypedError(result.data))
      : (new Failure(result.error) as unknown as ChainableResultType<U, F>);
  }

  /** Match with typed mappers synchronously */
  matchWith<U, F extends Error, MS extends Error, ME extends Error>(
    _successMapper: MapperFn<never, U, MS>,
    errorMapper: MapperFn<E, F, ME>
  ): ChainableResultType<U, F | MS | ME> {
    const result = tryCatch(syncFn<ME>()(() => errorMapper.fn(this.error.raw)));
    return result.success
      ? new Failure(normalizeTypedError(result.data))
      : new Failure(result.error);
  }

  /** Match with typed mappers asynchronously */
  async matchWithAsync<U, F extends Error, MS extends Error, ME extends Error>(
    _successMapper: MapperFnAsync<never, U, MS>,
    errorMapper: MapperFnAsync<E, F, ME>
  ): Promise<ChainableResultType<U, F | MS | ME>> {
    const result = await tryCatchAsync(
      asyncFn<ME>()(async () => errorMapper.fn(this.error.raw))
    );
    return result.success
      ? new Failure(normalizeTypedError(result.data))
      : new Failure(result.error);
  }

  /** Always fails when combining */
  combine<U, F extends Error>(): ChainableResultType<never, E> {
    return this;
  }

  /** Always fails when combining multiple */
  combineAll<U, F extends Error>(): ChainableResultType<never, E> {
    return this;
  }

  /** Returns a default value */
  getOrElse<R>(defaultValue: R): R {
    return defaultValue;
  }

  /** Converts to a rejected Promise */
  toPromise<R>(): Promise<R> {
    return Promise.reject(this.error.raw);
  }

  /** Converts to a standard Result */
  toResult<R>(): ResultType<R, E> {
    return { success: false, error: this.error };
  }
}

/**
 * ChainableResult class with static methods for creating and manipulating chainable results
 */
export class ChainableResult {
  /**
   * Creates a Success result
   */
  static success<T>(data: T): Success<T> {
    return new Success(data);
  }

  /**
   * Creates a Failure result
   */
  static failure<E extends Error>(error: ResultError<E>): Failure<E> {
    return new Failure(error);
  }

  /**
   * Creates a Failure result from an Error
   */
  static fromError<E extends Error>(error: E): Failure<E> {
    return new Failure(normalizeTypedError(error));
  }

  /**
   * Converts a standard Result to a ChainableResult
   */
  static fromResult<T, E extends Error>(
    result: ResultType<T, E>
  ): ChainableResultType<T, E> {
    return result.success
      ? new Success(result.data)
      : new Failure(result.error);
  }

  /**
   * Converts a Promise to a ChainableResult
   */
  static async fromPromise<T, E extends Error = Error>(
    promise: Promise<T>,
    errorFactory?: (error: unknown) => E
  ): Promise<ChainableResultType<T, E>> {
    const result = await tryCatchAsync(asyncFn<Error>()(async () => promise));

    if (result.success) {
      return new Success(result.data);
    } else {
      if (errorFactory) {
        const typedError = errorFactory(result.error.raw);
        return new Failure(normalizeTypedError(typedError));
      }
      return new Failure(normalizeError<E>(result.error.raw));
    }
  }

  /**
   * Combines multiple Results into a single Result
   */
  static combine<T extends unknown[], E extends Error>(
    ...results: { [K in keyof T]: Success<T[K]> | Failure<E> }
  ): ChainableResultType<T, E> {
    if (results.length === 0) {
      return new Success([] as unknown as T);
    }

    const combined: unknown[] = [];
    for (const result of results) {
      if (!result.success) {
        return result as Failure<E>;
      }
      combined.push(result.data);
    }
    return new Success(combined as T);
  }

  /**
   * Combines multiple Results into a single Result with an array of successes
   */
  static combineResults<T, E extends Error>(
    results: (Success<T> | Failure<E>)[]
  ): ChainableResultType<T[], E> {
    const successes: T[] = [];
    for (const result of results) {
      if (result.success) {
        successes.push(result.data);
      } else {
        return result as Failure<E>;
      }
    }
    return new Success(successes);
  }

  /**
   * Waits for multiple Result Promises to resolve and combines them
   */
  static async sequenceResults<T, E extends Error>(
    promises: Promise<Success<T> | Failure<E>>[]
  ): Promise<ChainableResultType<T[], E>> {
    const results = await Promise.all(promises);
    return ChainableResult.combineResults(results);
  }

  /**
   * Collects results from multiple operations, grouping successes and failures
   */
  static collectResults<T, E extends Error>(
    results: (Success<T> | Failure<E>)[]
  ): ChainableResultType<T[], InstanceType<typeof CollectedErrors>> {
    const successes: T[] = [];
    const errors: ResultError<E>[] = [];

    for (const result of results) {
      if (result.success) {
        successes.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    return errors.length === 0
      ? new Success(successes)
      : new Failure(
          normalizeTypedError(
            new CollectedErrors(`${errors.length} operation(s) failed`, {
              data: { errors },
            })
          )
        );
  }

  /**
   * Executes a wrapped synchronous function with tryCatch and returns a ChainableResult
   */
  static tryCatch<T, E extends Error, Args extends readonly unknown[]>(
    wrappedFn: SyncFnWithErr<T, E, Args>,
    ...args: Args
  ): ChainableResultType<T, E> {
    const result = tryCatch(wrappedFn, ...args);
    return ChainableResult.fromResult(result);
  }

  /**
   * Executes a wrapped asynchronous function with tryCatchAsync and returns a ChainableResult
   */
  static async tryCatchAsync<
    T,
    E extends Error,
    Args extends readonly unknown[]
  >(
    wrappedFn: AsyncFnWithErr<T, E, Args>,
    ...args: Args
  ): Promise<ChainableResultType<T, E>> {
    const result = await tryCatchAsync(wrappedFn, ...args);
    return ChainableResult.fromResult(result);
  }
}
