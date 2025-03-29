import {
  tryCatchAsync,
  mkErrClass,
  flatMapResult,
  compose,
  composeFns,
  mapError,
  withCode,
  isErrorType,
  mapperFn,
  AsyncFnWithErr,
  asyncFn,
} from "..";

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

// Create custom error classes with specific data
const NetworkError = mkErrClass<NetworkErrorData>(
  "NetworkError",
  "NETWORK_ERROR",
  { url: "", retryable: false }
);
const ValidationError = mkErrClass<ValidationErrorData>(
  "ValidationError",
  "VALIDATION_ERROR",
  { field: "", value: null, constraints: [] }
);
const AuthError = mkErrClass<AuthErrorData>("AuthError", "AUTH_ERROR", {
  user: undefined,
  requiredRole: undefined,
});
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");

// Define types for instances
type NetworkErrorInstance = InstanceType<typeof NetworkError>;
type ValidationErrorInstance = InstanceType<typeof ValidationError>;
type AuthErrorInstance = InstanceType<typeof AuthError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;

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
    async (id: string, token?: string) => {
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

// Create a wrapper for adding posts to a user
// This wrapper is kept for reference to show both methods of composition:
// 1. wrapper-based composition with compose (shown below but not used)
// 2. direct function composition with composeFns (used in example 2.1)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function withUserPostsWrapper<E extends Error>(
  fn: AsyncFnWithErr<User, E, UserArgs>
): AsyncFnWithErr<
  UserWithPosts,
  E | NetworkErrorInstance | NotFoundErrorInstance,
  UserArgs
> {
  return new AsyncFnWithErr<
    UserWithPosts,
    E | NetworkErrorInstance | NotFoundErrorInstance,
    UserArgs
  >(async (...args: UserArgs) => {
    const user = await fn.fn(...args);
    const posts = await postService.getPosts.fn(user.id);
    return { ...user, posts };
  });
}

// Advanced composition that demonstrates unified error handling
async function runAdvancedExample() {
  console.log("========== Advanced Type Inference Examples ==========");

  try {
    // 1. Function with union error types
    console.log("\n1. Handling multiple error types:");

    // Use withCode to add a custom error code
    const getUserWithCode = withCode<NetworkErrorInstance | AuthErrorInstance>(
      "USER_API"
    )(async (id: string, token?: string) => {
      return await userService.getUser.fn(id, token);
    });

    // Try with different IDs to trigger different errors
    const ids = ["123", "admin1", "error"];

    for (const id of ids) {
      console.log(`\nAttempting to fetch user ${id}:`);
      const result = await tryCatchAsync(getUserWithCode, id);

      if (result.success) {
        console.log("✅ Success:", result.data);
      } else {
        console.log("❌ Error:", result.error.message);
        console.log("   Code:", result.error.code);

        // Type narrowing based on error instance using the utility
        if (isErrorType(result.error.raw, NetworkError)) {
          console.log("   Type: Network Error");
          console.log("   URL:", result.error.raw.data.url);
          console.log("   Retryable:", result.error.raw.data.retryable);
        } else if (isErrorType(result.error.raw, AuthError)) {
          console.log("   Type: Auth Error");
          console.log("   Required Role:", result.error.raw.data.requiredRole);
        }
      }
    }

    // 2. Function composition with multiple error types
    console.log("\n2. Composing functions with different error types:");

    // Example 2.1: Direct function composition with composeFns
    // The resulting function can throw any of the combined error types
    const getUserWithPosts = composeFns(
      userService.getUser,
      (user) =>
        new AsyncFnWithErr<
          UserWithPosts,
          NetworkErrorInstance | NotFoundErrorInstance,
          readonly []
        >(async () => {
          const posts = await postService.getPosts.fn(user.id);
          return { ...user, posts };
        })
    );

    // Example 2.2: Wrapper composition with compose
    // First create a wrapper that adds authentication headers
    const withAuthHeaders = <T, E extends Error>(
      fn: AsyncFnWithErr<T, E, UserArgs>
    ): AsyncFnWithErr<T, E, UserArgs> => {
      return new AsyncFnWithErr<T, E, UserArgs>(
        async (id: string, token?: string) => {
          console.log(
            `Adding auth headers for request with token: ${token ? "✓" : "✗"}`
          );
          return fn.fn(id, token);
        }
      );
    };

    // Create a wrapper that adds logging
    const withLogging = <T, E extends Error>(
      fn: AsyncFnWithErr<T, E, UserArgs>
    ): AsyncFnWithErr<T, E, UserArgs> => {
      return new AsyncFnWithErr<T, E, UserArgs>(async (...args: UserArgs) => {
        console.log(`Executing function with args:`, args);
        try {
          const result = await fn.fn(...args);
          console.log(`Function executed successfully`);
          return result;
        } catch (error) {
          console.log(
            `Function failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          throw error;
        }
      });
    };

    // Apply wrappers to the user service using compose
    const enhancedGetUser = compose<
      User,
      NetworkErrorInstance | AuthErrorInstance,
      UserArgs,
      never,
      never
    >(
      withAuthHeaders,
      withLogging
    )(userService.getUser);

    // Use our enhanced user service with the direct composition approach
    console.log("\nFetching user with enhanced service and posts:");
    const enhancedResult = await tryCatchAsync(
      composeFns(
        enhancedGetUser,
        (user) =>
          new AsyncFnWithErr<
            UserWithPosts,
            NetworkErrorInstance | NotFoundErrorInstance,
            readonly []
          >(async () => {
            const posts = await postService.getPosts.fn(user.id);
            return { ...user, posts };
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

    // Continue with regular composition for comparison
    console.log("\nFetching user with posts (standard approach):");
    const userWithPostsResult = await tryCatchAsync(
      getUserWithPosts,
      "123",
      "token123"
    );

    if (userWithPostsResult.success) {
      console.log("✅ Got user with posts:", userWithPostsResult.data);
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

    // 3. Chaining operations with flatMapResult:
    console.log("\n3. Chaining operations with flatMapResult:");

    // Get user -> validate user -> get posts (each step can fail with different errors)
    const user123Result = await tryCatchAsync(
      userService.getUser,
      "123",
      "token123"
    );

    const userToValidatedMapper = mapperFn<
      ValidationErrorInstance | NetworkErrorInstance | NotFoundErrorInstance
    >()(async (user: User) => {
      const validationResult = await tryCatchAsync(
        userService.validateUser,
        user
      );
      return flatMapResult(
        validationResult,
        mapperFn<NetworkErrorInstance | NotFoundErrorInstance>()(
          async (validUser: User) =>
            tryCatchAsync(postService.getPosts, validUser.id)
        )
      );
    });

    const validatedWithPostsResult = await flatMapResult(
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

    // 4. Error mapping
    console.log("\n4. Mapping error types:");

    // Define AppError data interface
    interface AppErrorData extends Record<string, unknown> {
      originalType: string;
    }

    const errorResult = await tryCatchAsync(userService.getUser, "error");
    const AppError = mkErrClass<AppErrorData>("AppError", "APP_ERROR", {
      originalType: "",
    });

    const mappedResult = mapError(errorResult, (originalError: Error) => {
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
