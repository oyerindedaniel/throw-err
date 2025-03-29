import { SyncFnWithErr } from "./SyncFnWithErr";
import { AsyncFnWithErr } from "./AsyncFnWithErr";
import { Result } from "../types/Result";
import { tryCatchSync, tryCatchAsync } from "./tryCatch";

/**
 * Options for creating a function group
 */
export interface GroupOptions {
  /**
   * Prefix for function names (used in error reporting)
   */
  namePrefix?: string;

  /**
   * Default options applied to all functions in the group
   */
  defaultOptions?: {
    /**
     * Whether to auto-wrap functions with tryCatch
     */
    autoWrap?: boolean;
  };
}

/**
 * Type to store sync function implementations with their types
 */
interface SyncFunctionEntry<SharedE extends Error> {
  fn: SyncFnWithErr<unknown, SharedE, readonly unknown[]>;
  // Type information stored for reference but not actually used at runtime
  _types?: {
    args: unknown[];
    return: unknown;
  };
}

/**
 * Type to store async function implementations with their types
 */
interface AsyncFunctionEntry<SharedE extends Error> {
  fn: AsyncFnWithErr<unknown, SharedE, readonly unknown[]>;
  // Type information stored for reference but not actually used at runtime
  _types?: {
    args: unknown[];
    return: unknown;
  };
}

/**
 * Type for a function group API
 */
export type GroupApi<SharedE extends Error> = Record<
  string,
  <T, Args extends unknown[]>(
    ...args: Args
  ) => Result<T, SharedE> | Promise<Result<T, SharedE>>
>;

/**
 * Creates a group of related functions with shared error types and behavior
 *
 * @template SharedE Common error type that all functions in the group can throw
 * @param options Configuration options for the function group
 * @returns A group object with methods to add and manage related functions
 *
 * @example
 * ```typescript
 * // Define shared error types for user operations
 * const UserError = mkErrClass("UserError", "USER_ERROR");
 * type UserErrorInstance = InstanceType<typeof UserError>;
 *
 * // Create a group for user-related functions
 * const userOps = groupFn<UserErrorInstance>({ namePrefix: "user" });
 *
 * // Add synchronous functions to the group
 * userOps.addSync("validate")((user: User) => {
 *   if (!user.email) throw new UserError("Email is required");
 *   return user;
 * });
 *
 * // Add async functions to the group with a specific error type
 * userOps.addAsync<FetchErrorInstance>("fetch")(async (id: string) => {
 *   const response = await fetch(`/api/users/${id}`);
 *   if (!response.ok) throw new FetchError(`Failed to fetch user ${id}`);
 *   return await response.json();
 * });
 *
 * // Use the functions with automatic error handling
 * const userResult = await userOps.executeAsync("fetch", "123");
 * if (userResult.success) {
 *   // Process user data
 *   const validatedResult = userOps.executeSync("validate", userResult.data);
 * }
 * ```
 */
export function groupFn<SharedE extends Error>(options: GroupOptions = {}) {
  const syncFunctions: Record<string, SyncFunctionEntry<SharedE>> = {};
  const asyncFunctions: Record<string, AsyncFunctionEntry<SharedE>> = {};

  const namePrefix = options.namePrefix ?? "";
  const defaultOptions = options.defaultOptions ?? { autoWrap: true };

  return {
    /**
     * Adds a synchronous function to the group
     * @param name Unique name for the function within the group
     * @returns A function that accepts the implementation and registers it with the group
     */
    addSync(name: string) {
      return <E extends SharedE = SharedE>() =>
        // This overloaded form allows providing a specific error type
        <T, Args extends readonly unknown[]>(fn: (...args: Args) => T) => {
          const wrappedFn = new SyncFnWithErr<T, E, Args>(fn);
          syncFunctions[name] = {
            fn: wrappedFn as unknown as SyncFnWithErr<
              unknown,
              SharedE,
              readonly unknown[]
            >,
          };
          return this;
        };
    },

    /**
     * Adds an asynchronous function to the group
     * @param name Unique name for the function within the group
     * @returns A function that accepts the implementation and registers it with the group
     */
    addAsync(name: string) {
      return <E extends SharedE = SharedE>() =>
        // This overloaded form allows providing a specific error type
        <T, Args extends readonly unknown[]>(
          fn: (...args: Args) => Promise<T>
        ) => {
          const wrappedFn = new AsyncFnWithErr<T, E, Args>(fn);
          asyncFunctions[name] = {
            fn: wrappedFn as unknown as AsyncFnWithErr<
              unknown,
              SharedE,
              readonly unknown[]
            >,
          };
          return this;
        };
    },

    /**
     * Legacy method for adding a synchronous function without currying
     * @deprecated Use the curried form addSync(name)() instead
     */
    addSyncLegacy<
      T,
      E extends SharedE = SharedE,
      Args extends unknown[] = unknown[]
    >(name: string, fn: (...args: Args) => T) {
      const wrappedFn = new SyncFnWithErr<T, E, Args>(fn);
      syncFunctions[name] = {
        fn: wrappedFn as unknown as SyncFnWithErr<
          unknown,
          SharedE,
          readonly unknown[]
        >,
      };
      return this;
    },

    /**
     * Legacy method for adding an asynchronous function without currying
     * @deprecated Use the curried form addAsync(name)() instead
     */
    addAsyncLegacy<
      T,
      E extends SharedE = SharedE,
      Args extends unknown[] = unknown[]
    >(name: string, fn: (...args: Args) => Promise<T>) {
      const wrappedFn = new AsyncFnWithErr<T, E, Args>(fn);
      asyncFunctions[name] = {
        fn: wrappedFn as unknown as AsyncFnWithErr<
          unknown,
          SharedE,
          readonly unknown[]
        >,
      };
      return this;
    },

    /**
     * Executes a synchronous function from the group
     * @template T Return type of the function
     * @template E Error type of the function
     * @template Args Argument types for the function
     * @param name Name of the function to execute
     * @param args Arguments to pass to the function
     * @returns Result with either the function's return value or error
     */
    executeSync<T, E extends SharedE, Args extends unknown[]>(
      name: string,
      ...args: Args
    ): Result<T, E> {
      const entry = syncFunctions[name];
      if (!entry) {
        throw new Error(`Function '${namePrefix}${name}' not found in group`);
      }

      const fn = entry.fn as unknown as SyncFnWithErr<T, E, Args>;

      if (defaultOptions.autoWrap) {
        return tryCatchSync(fn, ...args);
      }

      return Result.success(fn.fn(...args));
    },

    /**
     * Executes an asynchronous function from the group
     * @template T Return type of the function
     * @template E Error type of the function
     * @template Args Argument types for the function
     * @param name Name of the function to execute
     * @param args Arguments to pass to the function
     * @returns Promise for a Result with either the function's return value or error
     */
    async executeAsync<T, E extends SharedE, Args extends unknown[]>(
      name: string,
      ...args: Args
    ): Promise<Result<T, E>> {
      const entry = asyncFunctions[name];
      if (!entry) {
        throw new Error(`Function '${namePrefix}${name}' not found in group`);
      }

      const fn = entry.fn as unknown as AsyncFnWithErr<T, E, Args>;

      if (defaultOptions.autoWrap) {
        return await tryCatchAsync(fn, ...args);
      }

      return Result.success(await fn.fn(...args));
    },

    /**
     * Lists all functions in the group
     * @returns Object containing all sync and async function names
     */
    list() {
      return {
        sync: Object.keys(syncFunctions),
        async: Object.keys(asyncFunctions),
      };
    },

    /**
     * Checks if a function exists in the group
     * @param name Name of the function to check
     * @param type Optional type of function to check ('sync' or 'async')
     * @returns Boolean indicating if the function exists
     */
    has(name: string, type?: "sync" | "async"): boolean {
      if (type === "sync") return name in syncFunctions;
      if (type === "async") return name in asyncFunctions;
      return name in syncFunctions || name in asyncFunctions;
    },

    /**
     * Creates an API object with all the functions in the group.
     * Each function will return a Result object.
     */
    createApi<T>(): T {
      const api = {} as T;

      // Add all sync functions
      Object.keys(syncFunctions).forEach((name) => {
        Object.defineProperty(api, name, {
          enumerable: true,
          value: (...args: unknown[]) => this.executeSync(name, ...args),
        });
      });

      // Add all async functions
      Object.keys(asyncFunctions).forEach((name) => {
        Object.defineProperty(api, name, {
          enumerable: true,
          value: (...args: unknown[]) => this.executeAsync(name, ...args),
        });
      });

      return api;
    },
  };
}
