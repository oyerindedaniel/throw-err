import { AsyncFnWithErr } from "../core/AsyncFnWithErr";
import { asyncFn } from "../core/asyncFn";
import { tryCatch } from "../core/tryCatch";

/**
 * Composes two async functions, creating a new function that passes
 * the output of the first to the second and combines their error types
 * @template T1 The return type of the first function
 * @template T2 The return type of the second function
 * @template E1 The error type of the first function
 * @template E2 The error type of the second function
 * @template Args1 The argument types of the first function
 * @param fn1 The first async function
 * @param fn2 A function that takes the result of fn1 and returns a new AsyncFnWithErr
 * @returns A composed AsyncFnWithErr that combines both functions
 * @example
 * ```typescript
 * const fetchUserPosts = compose(
 *   fetchUser,
 *   user => asyncFn<PostError>()(async () => {
 *     const response = await fetch(`/api/users/${user.id}/posts`);
 *     if (!response.ok) throw new PostError('Failed to fetch posts');
 *     return await response.json();
 *   })
 * );
 *
 * // Combined error type is FetchError | PostError
 * const result = await tryCatch(fetchUserPosts, '123');
 * ```
 */
// dont use this, use the core compose instead
export function compose<
  T1,
  T2,
  E1 extends Error,
  E2 extends Error,
  Args1 extends readonly unknown[]
>(
  fn1: AsyncFnWithErr<T1, E1, Args1>,
  fn2: (input: T1) => AsyncFnWithErr<T2, E2, readonly unknown[]>
): AsyncFnWithErr<T2, E1 | E2, Args1> {
  return asyncFn<E1 | E2>()(async (...args: Args1) => {
    const result1 = await tryCatch(fn1, ...args);
    if (!result1.success) throw result1.error.raw;

    const fn2Wrapped = fn2(result1.data);
    const result2 = await tryCatch(fn2Wrapped);

    if (!result2.success) throw result2.error.raw;
    return result2.data;
  });
}
