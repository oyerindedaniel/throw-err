import {
  tryCatchAsync,
  mkErrClass,
  mapErr,
  isErrorType,
  mapperFn,
  AsyncFnWithErr,
  asyncFn,
  mapperFnAsync,
  flatMapWithAsync,
  normalizeError,
  pipe,
  compose,
} from "..";
import { createWrapper } from "../core/create-wrapper";

// Define complex error hierarchy
interface NetworkErrorData extends Record<string, unknown> {
  url: string;
  status?: number;
  retryable: boolean;
}

interface ValidationErrorData extends Record<string, unknown> {
  field: string;
  value: unknown;
  constraints: string[];
}

interface AuthErrorData extends Record<string, unknown> {
  user?: string;
  requiredRole?: string;
}

interface RateLimitErrorData extends Record<string, unknown> {
  retryAfterMs: number;
  maxCalls: number;
  periodMs: number;
}

interface CircuitBreakerErrorData extends Record<string, unknown> {
  openUntil: number;
  failureCount: number;
}

// Create custom error classes with specific data
const NetworkError = mkErrClass<NetworkErrorData, "NetworkError">(
  "NetworkError",
  "NETWORK_ERROR",
  { url: "", retryable: false }
);
const ValidationError = mkErrClass<ValidationErrorData, "ValidationError">(
  "ValidationError",
  "VALIDATION_ERROR",
  { field: "", value: null, constraints: [] }
);
const AuthError = mkErrClass<AuthErrorData, "AuthError">(
  "AuthError",
  "AUTH_ERROR",
  {
    user: undefined,
    requiredRole: undefined,
  }
);
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");

// Use mkErrClass instead of traditional classes
const RateLimitError = mkErrClass<RateLimitErrorData, "RateLimitError">(
  "RateLimitError",
  "RATE_LIMIT",
  { retryAfterMs: 0, maxCalls: 0, periodMs: 0 }
);

const CircuitBreakerError = mkErrClass<
  CircuitBreakerErrorData,
  "CircuitBreakerError"
>("CircuitBreakerError", "CIRCUIT_OPEN", { openUntil: 0, failureCount: 0 });

// Define types for instances
type NetworkErrorInstance = InstanceType<typeof NetworkError>;
type ValidationErrorInstance = InstanceType<typeof ValidationError>;
type AuthErrorInstance = InstanceType<typeof AuthError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;
type RateLimitErrorInstance = InstanceType<typeof RateLimitError>;
type CircuitBreakerErrorInstance = InstanceType<typeof CircuitBreakerError>;

// Define User and Post interfaces for better typing
interface User {
  id: string;
  name: string;
  role: string;
  [key: string]: unknown;
}

interface Post {
  id: number;
  title: string;
  [key: string]: unknown;
}

interface PostData {
  title: string;
  content?: string;
  [key: string]: unknown;
}

type UserArgs = readonly [id: string, token?: string];
type UserWithPosts = User & { posts: Post[] };

// API services with specific error types
// User service that might throw network or auth errors

const userService = {
  getUser: asyncFn<NetworkErrorInstance | AuthErrorInstance>()(
    async (id: string, token?: string): Promise<User> => {
      console.log(`Fetching user ${id} with${token ? "" : "out"} token`);

      // Auth error
      if (id.startsWith("admin") && !token) {
        throw new AuthError("Authentication required for admin users", {
          data: {
            requiredRole: "ADMIN",
          },
        });
      }

      // Network error
      if (id === "error") {
        throw new NetworkError("Failed to reach user service", {
          data: {
            url: "/api/users/error",
            retryable: true,
          },
        });
      }

      return {
        id,
        name: `User ${id}`,
        role: id.startsWith("admin") ? "ADMIN" : "USER",
      } as User;
    }
  ),

  // User validation that might throw validation errors
  validateUser: asyncFn<ValidationErrorInstance>()(async (userData: User) => {
    if (!userData.name || userData.name.length < 3) {
      throw new ValidationError("Invalid user data", {
        data: {
          field: "name",
          value: userData.name,
          constraints: ["required", "minLength:3"],
        },
      });
    }

    return userData;
  }),
};

// Post service that might throw network or not found errors
const postService = {
  getPosts: asyncFn<NetworkErrorInstance | NotFoundErrorInstance>()(
    async (userId: string) => {
      console.log(`Fetching posts for user ${userId}`);

      if (userId === "noposts") {
        throw new NotFoundError(`No posts found for user ${userId}`);
      }

      if (userId === "error") {
        throw new NetworkError("Failed to reach post service", {
          data: {
            url: "/api/posts",
            retryable: false,
          },
        });
      }

      return [
        { id: 1, title: `Post 1 for ${userId}` },
        { id: 2, title: `Post 2 for ${userId}` },
      ] as Post[];
    }
  ),

  // Post creation that might throw multiple error types
  createPost: asyncFn<
    NetworkErrorInstance | ValidationErrorInstance | AuthErrorInstance
  >()(async (userId: string, postData: PostData, token?: string) => {
    // Check auth
    if (!token) {
      throw new AuthError("Authentication required to create posts", {
        data: { requiredRole: "USER" },
      });
    }

    // Validate post
    if (!postData.title || postData.title.length < 5) {
      throw new ValidationError("Invalid post data", {
        data: {
          field: "title",
          value: postData.title,
          constraints: ["required", "minLength:5"],
        },
      });
    }

    // Network error
    if (userId === "error") {
      throw new NetworkError("Failed to connect to post service", {
        data: {
          url: "/api/posts",
          status: 503,
          retryable: true,
        },
      });
    }

    return { id: Date.now(), userId, ...postData } as Post;
  }),
};

// Create a wrapper for adding posts to a user using asyncFn
function withUserPostsWrapper<E extends Error>(
  fn: AsyncFnWithErr<User, E, UserArgs>
): AsyncFnWithErr<
  UserWithPosts,
  E | NetworkErrorInstance | NotFoundErrorInstance,
  UserArgs
> {
  return asyncFn<E | NetworkErrorInstance | NotFoundErrorInstance>()(
    async (...args: UserArgs): Promise<UserWithPosts> => {
      const user = await fn.fn(...args);
      const posts = await postService.getPosts.fn(user.id);
      return { ...user, posts };
    }
  );
}

// Create custom wrappers using create-wrapper.ts utility

// 1. Create a Circuit Breaker wrapper to protect from cascading failures using createWrapper
const withCircuitBreaker = (
  failureThreshold: number = 3,
  resetTimeoutMs: number = 30000
) => {
  let failures = 0;
  let isOpen = false;
  let lastFailureTime = 0;

  return <T, E extends Error, Args extends readonly unknown[]>(
    fn: AsyncFnWithErr<T, E, Args>
  ): AsyncFnWithErr<T, E | CircuitBreakerErrorInstance, Args> => {
    return createWrapper<CircuitBreakerErrorInstance>()(
      fn,
      (wrappedFn) =>
        new AsyncFnWithErr(async (...args: Args) => {
          // Check if circuit is open (failed)
          if (isOpen) {
            const now = Date.now();
            if (now - lastFailureTime > resetTimeoutMs) {
              // Reset after timeout
              isOpen = false;
              failures = 0;
            } else {
              const openUntil = lastFailureTime + resetTimeoutMs;
              throw new CircuitBreakerError(
                `Circuit breaker is open. Try again after ${Math.ceil(
                  (openUntil - now) / 1000
                )} seconds`,
                {
                  data: {
                    openUntil,
                    failureCount: failures,
                  },
                }
              );
            }
          }

          try {
            const result = await wrappedFn.fn(...args);
            // Success resets failure count
            failures = 0;
            return result;
          } catch (error) {
            failures++;
            lastFailureTime = Date.now();

            if (failures >= failureThreshold) {
              isOpen = true;
            }

            throw error;
          }
        })
    );
  };
};

// const userWithCircuitBreaker = withCircuitBreaker(2, 5000)(userService.getUser).fn("123");

// 2. Create a Rate Limiter wrapper to limit API calls using createWrapper
const withRateLimit = (maxCalls: number = 5, periodMs: number = 60000) => {
  const callTimes: number[] = [];

  return <T, E extends Error, Args extends readonly unknown[]>(
    fn: AsyncFnWithErr<T, E, Args>
  ): AsyncFnWithErr<T, E | RateLimitErrorInstance, Args> => {
    return createWrapper<RateLimitErrorInstance>()(
      fn,
      (wrappedFn) =>
        new AsyncFnWithErr(async (...args: Args) => {
          const now = Date.now();

          // Remove old calls outside the time window
          while (callTimes.length > 0 && callTimes[0] < now - periodMs) {
            callTimes.shift();
          }

          // Check if we've exceeded our rate limit
          if (callTimes.length >= maxCalls) {
            const oldestCall = callTimes[0];
            const retryAfterMs = oldestCall + periodMs - now;
            throw new RateLimitError(
              `Rate limit exceeded. Try again after ${Math.ceil(
                retryAfterMs / 1000
              )} seconds`,
              {
                data: {
                  retryAfterMs,
                  maxCalls,
                  periodMs,
                },
              }
            );
          }

          // Add this call to history
          callTimes.push(now);

          // Execute the function
          return await wrappedFn.fn(...args);
        })
    );
  };
};

// Custom wrapper for auth headers
const withAuthHeaders = <T, E extends Error>(
  fn: AsyncFnWithErr<T, E, UserArgs>
): AsyncFnWithErr<T, E, UserArgs> => {
  return asyncFn<E>()(async (id: string, token?: string) => {
    console.log(
      `Adding auth headers for request with token: ${token ? "✓" : "✗"}`
    );
    return fn.fn(id, token);
  });
};

// Custom wrapper for logging
const withLogging = <T, E extends Error, Args extends readonly unknown[]>(
  fn: AsyncFnWithErr<T, E, Args>
): AsyncFnWithErr<T, E, Args> => {
  return asyncFn<E>()(async (...args: Args) => {
    console.log(`Executing function with args:`, args);
    try {
      const result = await fn.fn(...args);
      console.log(`Function executed successfully`);
      return result;
    } catch (error) {
      console.log(`Function failed: ${normalizeError(error).message}`);
      throw error;
    }
  });
};

// Advanced composition that demonstrates unified error handling
async function runAdvancedExample() {
  console.log("========== Advanced Type Inference Examples ==========");

  try {
    // 1. Function composition with multiple error types
    console.log("\n2. Composing functions with different error types:");

    // Example 2.1: Both wrapper-based and direct function composition approaches
    console.log("\nExample 2.1: Composing user and posts fetching");

    // Approach 1: Using wrapper-based composition
    const getUserWithPostsWrapper = withUserPostsWrapper(userService.getUser);
    console.log("\nTrying wrapper-based approach:");
    const wrapperResult = await tryCatchAsync(
      getUserWithPostsWrapper,
      "123",
      "token123"
    );
    if (wrapperResult.success) {
      console.log("✅ Wrapper approach success:", {
        name: wrapperResult.data.name,
        postCount: wrapperResult.data.posts.length,
      });
    } else {
      console.log("❌ Wrapper approach failed:", wrapperResult.error.message);
      if (isErrorType(wrapperResult.error.raw, NetworkError)) {
        console.log("   Network Error at:", wrapperResult.error.raw.data.url);
      } else if (isErrorType(wrapperResult.error.raw, AuthError)) {
        console.log(
          "   Auth Error for role:",
          wrapperResult.error.raw.data.requiredRole
        );
      } else if (isErrorType(wrapperResult.error.raw, NotFoundError)) {
        console.log("   Not Found Error");
      }
    }

    // Approach 2: Using direct function composition with pipe - let types be inferred
    // Only specify the additional error type from the second function
    const getUserWithPosts = pipe(userService.getUser, (user) =>
      asyncFn<NetworkErrorInstance | NotFoundErrorInstance>()(async () => {
        const posts = await postService.getPosts.fn(user.id);
        return { ...user, posts } as UserWithPosts;
      })
    );

    console.log("\nTrying direct composition approach:");
    const directResult = await tryCatchAsync(
      getUserWithPosts,
      "123",
      "token123"
    );
    if (directResult.success) {
      console.log("✅ Direct composition success:", {
        name: directResult.data.name,
        postCount: directResult.data.posts.length,
      });
    } else {
      console.log("❌ Direct composition failed:", directResult.error.message);
      if (isErrorType(directResult.error.raw, NetworkError)) {
        console.log("   Network Error at:", directResult.error.raw.data.url);
      } else if (isErrorType(directResult.error.raw, AuthError)) {
        console.log(
          "   Auth Error for role:",
          directResult.error.raw.data.requiredRole
        );
      } else if (isErrorType(directResult.error.raw, NotFoundError)) {
        console.log("   Not Found Error");
      }
    }

    // Example 2.2: Wrapper composition with compose
    // Apply wrappers to the user service using compose - let types be inferred
    const enhancedGetUser = compose(userService.getUser)(
      withAuthHeaders,
      withLogging
    );

    // Use our enhanced user service with the direct composition approach
    console.log("\nFetching user with enhanced service and posts:");
    const enhancedResult = await tryCatchAsync(
      pipe(enhancedGetUser, (user) =>
        asyncFn<NetworkErrorInstance | NotFoundErrorInstance>()(async () => {
          const posts = await postService.getPosts.fn(user.id);
          return { ...user, posts } as UserWithPosts;
        })
      ),
      "123",
      "token123"
    );

    if (enhancedResult.success) {
      console.log("✅ Enhanced result:", {
        name: enhancedResult.data.name,
        role: enhancedResult.data.role,
        postCount: enhancedResult.data.posts.length,
      });
    }

    // Example using our new custom wrappers
    console.log(
      "\nExample with custom wrappers: Circuit Breaker and Rate Limiter"
    );

    // Apply rate limiting and circuit breaker patterns to our user service
    // Let compose infer types from userService.getUser
    const protectedGetUser = compose(userService.getUser)(
      withRateLimit(3, 10000),
      withCircuitBreaker(2, 5000)
    );

    console.log("\nTrying multiple calls with rate limiting:");

    // Make multiple calls to test rate limiting
    for (let i = 1; i <= 5; i++) {
      console.log(`\nCall ${i}:`);
      const result = await tryCatchAsync(
        protectedGetUser,
        "user" + i,
        "token123"
      );
      if (result.success) {
        console.log(`✅ Got user ${i}:`, {
          id: result.data.id,
          name: result.data.name,
        });
      } else {
        console.log(`❌ Call ${i} failed:`, result.error.message);

        // Handle specific error types
        if (isErrorType(result.error.raw, RateLimitError)) {
          const { retryAfterMs } = result.error.raw.data;
          const waitTime = Math.min(retryAfterMs, 1000); // Cap at 1 second for example
          console.log(`Waiting ${waitTime}ms before next call...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else if (isErrorType(result.error.raw, CircuitBreakerError)) {
          console.log(
            `Circuit breaker open until: ${new Date(
              result.error.raw.data.openUntil
            ).toLocaleTimeString()}`
          );
        }
      }
    }

    // Continue with regular composition for comparison
    console.log("\nFetching user with posts (standard approach):");
    const userWithPostsResult = await tryCatchAsync(
      getUserWithPosts,
      "123",
      "token123"
    );

    if (userWithPostsResult.success) {
      console.log("✅ Got user with posts:", {
        id: userWithPostsResult.data.id,
        name: userWithPostsResult.data.name,
        postCount: userWithPostsResult.data.posts.length,
      });
    } else {
      console.log("❌ Failed:", userWithPostsResult.error.message);

      // The error could be from either service - use the utility
      if (isErrorType(userWithPostsResult.error.raw, NetworkError)) {
        console.log(
          "   Network Error at:",
          userWithPostsResult.error.raw.data.url
        );
      } else if (isErrorType(userWithPostsResult.error.raw, AuthError)) {
        console.log(
          "   Auth Error for role:",
          userWithPostsResult.error.raw.data.requiredRole
        );
      } else if (isErrorType(userWithPostsResult.error.raw, NotFoundError)) {
        console.log("   Not Found Error");
      }
    }

    // 2. Chaining operations with flatMapWithMapperAsync:
    console.log("\n3. Chaining operations with flatMapWithMapperAsync:");

    // Get user -> validate user -> get posts (each step can fail with different errors)
    const user123Result = await tryCatchAsync(
      userService.getUser,
      "123",
      "token123"
    );

    const userToValidatedMapper = mapperFnAsync<
      ValidationErrorInstance | NetworkErrorInstance | NotFoundErrorInstance
    >()(async (user: User) => {
      const validationResult = await tryCatchAsync(
        userService.validateUser,
        user
      );
      return flatMapWithAsync(
        validationResult,
        mapperFn<NetworkErrorInstance | NotFoundErrorInstance>()(
          async (validUser: User) =>
            tryCatchAsync(postService.getPosts, validUser.id)
        )
      );
    });

    const validatedWithPostsResult = await flatMapWithAsync(
      user123Result,
      userToValidatedMapper
    );

    if (validatedWithPostsResult.success) {
      console.log(
        "✅ Validation and posts fetch succeeded:",
        validatedWithPostsResult.data
      );
    } else {
      console.log("❌ Chain failed:", validatedWithPostsResult.error.message);

      // The type system knows this error could be from any of the three operations
      // Use the utility for proper type narrowing
      if (isErrorType(validatedWithPostsResult.error.raw, NetworkError)) {
        console.log("Network Error");
      } else if (
        isErrorType(validatedWithPostsResult.error.raw, ValidationError)
      ) {
        console.log(
          "Validation Error on field:",
          validatedWithPostsResult.error.raw.data.field
        );
        console.log(
          "Constraints:",
          validatedWithPostsResult.error.raw.data.constraints
        );
      } else if (isErrorType(validatedWithPostsResult.error.raw, AuthError)) {
        console.log("Auth Error");
      } else if (
        isErrorType(validatedWithPostsResult.error.raw, NotFoundError)
      ) {
        console.log("Not Found Error");
      }
    }

    // 3. Error mapping
    console.log("\n4. Mapping error types:");

    // Define AppError data interface
    interface AppErrorData extends Record<string, unknown> {
      originalType: string;
    }

    const errorResult = await tryCatchAsync(userService.getUser, "error");
    const AppError = mkErrClass<AppErrorData, "AppError">(
      "AppError",
      "APP_ERROR",
      {
        originalType: "",
      }
    );

    const mappedResult = mapErr(errorResult, (originalError) => {
      // Convert all errors to a standardized AppError
      return new AppError(`Application error: ${originalError.message}`, {
        data: {
          originalType: originalError.name,
        },
      });
    });

    console.log(
      "Original error:",
      errorResult.success ? "No error" : errorResult.error.message
    );
    console.log(
      "Mapped error:",
      mappedResult.success ? "No error" : mappedResult.error.message
    );
    console.log(
      "Original type:",
      mappedResult.success ? "N/A" : mappedResult.error.raw.data.originalType
    );
  } catch (err) {
    console.error("Unexpected error in example:", err);
  }
}

// Run the example
runAdvancedExample().then(() => console.log("\nAdvanced example completed."));
