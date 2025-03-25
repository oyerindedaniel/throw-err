import { AsyncFnWithErr } from "./AsyncFnWithErr";

/**
 * Wraps an async function with retry logic
 * @param maxRetries Maximum number of retry attempts
 * @param delayMs Delay between retries in milliseconds
 */
export function withRetry<E extends Error>(
  maxRetries: number,
  delayMs: number
): <T, Args extends readonly unknown[]>(
  fn: AsyncFnWithErr<T, E, Args>
) => AsyncFnWithErr<T, E, Args> {
  return <T, Args extends readonly unknown[]>(
    fn: AsyncFnWithErr<T, E, Args>
  ) => {
    return new AsyncFnWithErr<T, E, Args>(async (...args: Args) => {
      let lastError: E | undefined;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn.fn(...args);
        } catch (error) {
          lastError = error as E;
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }
      if (!lastError) {
        throw new Error("Retry failed without an error");
      }
      throw lastError;
    });
  };
}

/**
 * Wraps an async function with a timeout
 * @param timeoutMs Timeout duration in milliseconds
 */
export function withTimeout<E extends Error>(
  timeoutMs: number
): <T, Args extends readonly unknown[]>(
  fn: AsyncFnWithErr<T, E, Args>
) => AsyncFnWithErr<T, E, Args> {
  return <T, Args extends readonly unknown[]>(
    fn: AsyncFnWithErr<T, E, Args>
  ) => {
    return new AsyncFnWithErr<T, E, Args>(async (...args: Args) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
      });

      return Promise.race([fn.fn(...args), timeoutPromise]);
    });
  };
}

/**
 * Wraps an async function with a fallback function to be used if the primary function fails
 * @param fallback The fallback function to use
 */
export function withFallback<E extends Error>(
  fallback: AsyncFnWithErr<unknown, E, readonly unknown[]>
): <T, Args extends readonly unknown[]>(
  fn: AsyncFnWithErr<T, E, Args>
) => AsyncFnWithErr<T, E, Args> {
  return <T, Args extends readonly unknown[]>(
    fn: AsyncFnWithErr<T, E, Args>
  ) => {
    return new AsyncFnWithErr<T, E, Args>(async (...args: Args) => {
      try {
        return await fn.fn(...args);
      } catch (error) {
        return (await fallback.fn(...args)) as T;
      }
    });
  };
}
