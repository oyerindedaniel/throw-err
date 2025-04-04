import {
  asyncFn,
  tryCatchAsync,
  mkErrClass,
  recoverAsync,
  retry,
  compose,
  mapperFn,
  mapperFnAsync,
  AsyncFnWithErr,
  composeFns,
  createErrorTypeGuard,
  Result,
} from "..";
import { mapWith } from "../utils/resultTransformers";

// Custom error types
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

const ApiError = mkErrClass<ApiErrorData, "ApiError">("ApiError", "API_ERROR", {
  status: 500,
  url: "/api/users",
});
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");

// Types for the custom error instances
type ApiErrorInstance = InstanceType<typeof ApiError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;

const isApiError = createErrorTypeGuard(ApiError);

// Type for user data
type User = { id: string; name: string; email: string };
type UserFnArgs = readonly [id: string];
// Type for post data
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
    const userResult = await tryCatchAsync(fetchUserApi, "123");

    if (userResult.success) {
      console.log("✅ User fetched successfully:", userResult.data);
    } else {
      console.log("❌ Failed to fetch user:", userResult.error.message);
      console.log("   Error code:", userResult.error.code);
      console.log("   Status:", userResult.error.raw.data.status);
      console.log("   URL:", userResult.error.raw.data.url);
    }

    // 2. Using map to transform the result
    console.log("\n2. Transforming the result with map:");

    const nameMapper = mapperFn<ApiErrorInstance>()(
      (user: { id: string; name: string; email: string }) => user.name
    );
    const nameResult = await mapWith(userResult, nameMapper);
    console.log(
      "User name result:",
      nameResult.success ? nameResult.data : nameResult.error.message
    );

    // 3. Using map to transform the result with a custom error type
    console.log("\n3. Transforming with map and custom error type:");

    // Define a custom format error for data transformation
    interface FormatErrorData {
      reason: string;
      field: string;
    }
    const FormatError = mkErrClass<FormatErrorData, "FormatError">(
      "FormatError",
      "FORMAT_ERROR",
      {
        reason: "Unknown formatting error",
        field: "unknown",
      }
    );
    type FormatErrorInstance = InstanceType<typeof FormatError>;

    // Create a mapper that might throw our custom error
    const userProfileMapper = mapperFn<FormatErrorInstance>()((user: User) => {
      if (!user.email.includes("@")) {
        throw new FormatError("Invalid email format", {
          data: {
            reason: "Missing @ symbol",
            field: "email",
          },
        });
      }

      // Transform the user into a profile object
      return {
        displayName: user.name.toUpperCase(),
        contactEmail: user.email,
        accountId: parseInt(user.id),
        verified: user.email.endsWith(".com"),
      };
    });

    // Apply the transformation - will return Result<Profile, ApiError | FormatError>
    const profileResult = mapWith(userResult, userProfileMapper);

    if (profileResult.success) {
      console.log("✅ User profile created:", profileResult.data);
    } else {
      if (isApiError(profileResult.error.raw)) {
        console.log("❌ API error:", profileResult.error.message);
        console.log("   Status:", profileResult.error.raw.data.status);
        console.log("   URL:", profileResult.error.raw.data.url);
        
      } else {
        console.log("❌ Format error:", profileResult.error.message);
        console.log("   Reason:", profileResult.error.raw.data.reason);
        console.log("   Field:", profileResult.error.raw.data.field);
      }
    }

    // 4. Using recoverWithMapperAsync to recover from errors
    console.log("\n4. Handling errors with recoverWithMapperAsync:");

    // Recovery with same type
    const userWithFallback = await recoverAsync(
      await tryCatchAsync(fetchUserApi, "999"), // This will likely fail
      mapperFnAsync<ApiErrorInstance>()(() =>
        Result.success({
          id: "0",
          name: "Guest User",
          email: "guest@example.com",
        })
      )
    );

    console.log("User with fallback (same type):", userWithFallback);

    // Recovery with different type
    const userSummary = await recoverAsync(
      await tryCatchAsync(fetchUserApi, "999"), // This will likely fail
      mapperFnAsync<ApiErrorInstance>()(() =>
        Result.success({
          displayName: "Guest",
          isAnonymous: true,
        })
      )
    );

    console.log("User with fallback (different type):", userSummary);

    // Error transformation with recoverWithMapperAsync
    console.log("\n5. Transforming errors with recoverWithMapperAsync:");

    // Create a unified application error
    const AppError = mkErrClass("AppError", "APP_ERROR");

    const transformedError = await recoverAsync(
      await tryCatchAsync(fetchUserApi, "999"), // This will fail with ApiError
      mapperFnAsync<ApiErrorInstance>()((error) =>
        Result.failure({
          raw: new AppError(
            `App error: ${error.message} (Code: ${error.code})`
          ),
          message: `User operation failed: ${error.message}`,
          code: "APP_ERROR",
        })
      )
    );

    if (!transformedError.success) {
      console.log("Transformed error:");
      console.log("  Original type:", "ApiError");
      console.log("  New type:", transformedError.error.raw.name);
      console.log("  Message:", transformedError.error.message);
      console.log("  Code:", transformedError.error.code);
    }

    // 6. Using retry for unreliable operations
    console.log("\n6. Retrying unreliable operations:");
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

    // 7. Composing functions
    console.log("\n7. Composing functions:");
    const getUserWithPostsSimple = composeFns(fetchUserApi, (user) =>
      asyncFn<NotFoundErrorInstance>()(async () => {
        const posts = await fetchUserPosts.fn(user.id);
        return {
          ...user,
          posts,
        };
      })
    );

    const composedResultSimple = await tryCatchAsync(
      getUserWithPostsSimple,
      "123"
    );

    if (composedResultSimple.success) {
      console.log("✅ User with posts:", composedResultSimple.data);
    } else {
      console.log(
        "❌ Failed to get user with posts:",
        composedResultSimple.error.message
      );
    }

    // 8. Composing functions with the new implementation
    console.log("\n8. Composing functions with the new implementation:");

    // Using compose with wrappers
    const getUserWithPosts = compose<
      User, // Return type
      ApiErrorInstance, // Base error type
      UserFnArgs, // Args type
      NotFoundErrorInstance // Additional error type from the withPostsWrapper
    >(withPostsWrapper)(fetchUserApi);

    const composedResult = await tryCatchAsync(getUserWithPosts, "123");

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
