import {
  asyncFn,
  tryCatch,
  mkErrClass,
  mapResult,
  catchErr,
  retry,
  compose,
  mapperFn,
  AsyncFnWithErr,
  composeFns,
} from "../src";

// Custom error types
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 500,
  url: "/api/users",
});
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");

// Types for the custom error instances
type ApiErrorInstance = InstanceType<typeof ApiError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;

// Type for user data
type User = { id: string; name: string; email: string };
type UserFnArgs = readonly [id: string];
type PostFnArgs = readonly [userId: string];
type Post = { id: number; title: string };

// Mock API function that might throw an ApiError
const fetchUserApi = asyncFn<ApiErrorInstance>()<User, UserFnArgs>(
  async (id: string) => {
    console.log(`Fetching user with id: ${id}`);

    // Simulate a random API error
    if (Math.random() < 0.3) {
      throw new ApiError("API request failed", {
        data: {
          status: 500,
          url: `/api/users/${id}`,
        },
      });
    }

    // Simulate a not found error
    if (id === "999") {
      throw new ApiError("User not found", {
        data: {
          status: 404,
          url: `/api/users/${id}`,
        },
      });
    }

    // Success response
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
    };
  }
);

// Function to get posts for a user
const fetchUserPosts = asyncFn<NotFoundErrorInstance>()(
  async (userId: string) => {
    console.log(`Fetching posts for user: ${userId}`);

    // Simulate a not found error
    if (userId === "0") {
      throw new NotFoundError("Posts not found for user");
    }

    // Success response
    return [
      { id: 1, title: `Post 1 for user ${userId}` },
      { id: 2, title: `Post 2 for user ${userId}` },
    ];
  }
);

// Create a wrapper for fetching posts for a user
function withPostsWrapper<E extends Error>(
  fn: AsyncFnWithErr<User, E, UserFnArgs>
): AsyncFnWithErr<
  User & { posts: Post[] },
  E | NotFoundErrorInstance,
  UserFnArgs
> {
  return new AsyncFnWithErr<
    User & { posts: Post[] },
    E | NotFoundErrorInstance,
    UserFnArgs
  >(async (...args: UserFnArgs) => {
    const user = await fn.fn(...args);
    const posts = await fetchUserPosts.fn(user.id);
    return { ...user, posts };
  });
}

async function runExample() {
  try {
    console.log("---------- Basic Usage ----------");

    // 1. Basic tryCatch usage
    console.log("\n1. Fetching a user:");
    const userResult = await tryCatch(fetchUserApi, "123");

    if (userResult.success) {
      console.log("✅ User fetched successfully:", userResult.data);
    } else {
      console.log("❌ Failed to fetch user:", userResult.error.message);
      console.log("   Error code:", userResult.error.code);
      console.log("   Status:", userResult.error.raw.data.status);
      console.log("   URL:", userResult.error.raw.data.url);
    }

    // 2. Using mapResult to transform the result
    console.log("\n2. Transforming the result with mapResult:");
    // Create a typed mapper function
    const nameMapper = mapperFn<Error>()(
      (user: { id: string; name: string; email: string }) => user.name
    );
    const nameResult = await mapResult(userResult, nameMapper);
    console.log(
      "User name result:",
      nameResult.success ? nameResult.data : nameResult.error.message
    );

    // 3. Using catchErr to recover from errors
    console.log("\n3. Handling errors with catchErr:");

    // Recovery with same type
    const userWithFallback = await catchErr(
      await tryCatch(fetchUserApi, "999"), // This will likely fail
      () => ({
        success: true,
        data: { id: "0", name: "Guest User", email: "guest@example.com" },
      })
    );

    console.log("User with fallback (same type):", userWithFallback);

    // Recovery with different type
    const userSummary = await catchErr(
      await tryCatch(fetchUserApi, "999"), // This will likely fail
      () => ({
        success: true,
        data: { displayName: "Guest", isAnonymous: true },
      })
    );

    console.log("User with fallback (different type):", userSummary);

    // Error transformation with catchErr
    console.log("\n3.3. Transforming errors with catchErr:");

    // Create a unified application error
    const AppError = mkErrClass("AppError", "APP_ERROR");
    type AppErrorInstance = InstanceType<typeof AppError>;

    const transformedError = await catchErr<
      { id: string; name: string; email: string },
      never,
      ApiErrorInstance,
      AppErrorInstance
    >(
      await tryCatch(fetchUserApi, "999"), // This will fail with ApiError
      (error) => ({
        success: false,
        error: {
          raw: new AppError(
            `App error: ${error.message} (Code: ${error.code})`
          ),
          message: `User operation failed: ${error.message}`,
          code: "APP_ERROR",
        },
      })
    );

    if (!transformedError.success) {
      console.log("Transformed error:");
      console.log("  Original type:", "ApiError");
      console.log("  New type:", transformedError.error.raw.name);
      console.log("  Message:", transformedError.error.message);
      console.log("  Code:", transformedError.error.code);
    }

    // 4. Using retry for unreliable operations
    console.log("\n4. Retrying unreliable operations:");
    const retriedResult = await retry(
      fetchUserApi,
      3, // 3 retries
      { delay: 500 }, // 500ms delay between retries
      "456"
    );

    console.log(
      retriedResult.success
        ? `✅ Succeeded after retries: ${retriedResult.data.name}`
        : `❌ Failed after all retries: ${retriedResult.error.message}`
    );

    // 4. Composing functions
    console.log("\n5. Composing functions:");
    const getUserWithPostsSimple = composeFns(fetchUserApi, (user) =>
      asyncFn<NotFoundErrorInstance>()(async () => {
        const posts = await fetchUserPosts.fn(user.id);
        return {
          ...user,
          posts,
        };
      })
    );

    const composedResultSimple = await tryCatch(getUserWithPostsSimple, "123");

    if (composedResultSimple.success) {
      console.log("✅ User with posts:", composedResultSimple.data);
    } else {
      console.log(
        "❌ Failed to get user with posts:",
        composedResultSimple.error.message
      );
    }

    // 6. Composing functions with the new implementation
    console.log("\n5. Composing functions with the new implementation:");

    // Using compose with wrappers
    const getUserWithPosts = compose<
      User, // Return type
      ApiErrorInstance, // Base error type
      UserFnArgs, // Args type
      NotFoundErrorInstance // Additional error type from the withPostsWrapper
    >(withPostsWrapper)(fetchUserApi);

    const composedResult = await tryCatch(getUserWithPosts, "123");

    if (composedResult.success) {
      console.log("✅ User with posts:", composedResult.data);
    } else {
      console.log(
        "❌ Failed to get user with posts:",
        composedResult.error.message
      );
    }
  } catch (err) {
    console.error("Unexpected error:", err);
  }
}

// Run the example
runExample().then(() => console.log("\nExample completed."));
