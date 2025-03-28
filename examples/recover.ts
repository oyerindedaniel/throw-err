import {
  tryCatch,
  Result,
  asyncFn,
  recover,
  mkErrClass,
  isErrorType,
  CommonErrorCodes,
} from "../src";

// Example domain entities
interface User {
  id: string;
  name: string;
  email: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
}

interface WorkflowResult {
  user: User;
  posts: Post[];
  summary: string;
}

// Use mkErrClass to create our error types
const NotFoundError = mkErrClass<{ entityType: string; id: string }>(
  "NotFoundError",
  CommonErrorCodes.NOT_FOUND,
  { entityType: "", id: "" }
);

const NetworkError = mkErrClass<{ endpoint?: string }>(
  "NetworkError",
  CommonErrorCodes.NETWORK,
  { endpoint: undefined }
);

// Create type aliases for our error classes
type NotFoundErrorType = InstanceType<typeof NotFoundError>;
type NetworkErrorType = InstanceType<typeof NetworkError>;

// Mock API functions with proper error typing
const fetchUser = asyncFn<NotFoundErrorType | Error>()(
  async (id: string): Promise<User> => {
    // Simulating a real API call that might fail
    if (id === "invalid") {
      throw new NotFoundError(`User with id ${id} not found`, {
        data: { entityType: "User", id },
      });
    }
    return {
      id,
      name: "John Doe",
      email: "john@example.com",
    };
  }
);

const fetchUserPosts = asyncFn<NetworkErrorType | Error>()(
  async (userId: string): Promise<Post[]> => {
    const endpoint = `/api/users/${userId}/posts`;

    // Simulating a network error
    if (Math.random() < 0.3) {
      throw new NetworkError("Failed to connect to posts service", {
        data: { endpoint },
      });
    }

    console.log(`Fetching posts for user ${userId}`);

    return [
      {
        id: "post-1",
        title: "First Post",
        content: "Hello world!",
      },
      {
        id: "post-2",
        title: "Second Post",
        content: "Another post",
      },
    ];
  }
);

// Cache to demonstrate async fallback
const cache = new Map<string, Post[]>();

// Example 1: Simple value fallback
async function getUserProfile(userId: string) {
  console.log("\n--- Example 1: Simple Value Fallback ---");

  const userResult = await tryCatch(fetchUser, userId);

  // If user fetch fails, recover with a guest user
  const safeUser = recover.sync(userResult, {
    id: "guest",
    name: "Guest User",
    email: "guest@example.com",
  } as User);

  console.log("User:", safeUser.data);

  return safeUser;
}

// Example 2: Function fallback with error context
async function getUserWithErrorContext(userId: string) {
  console.log("\n--- Example 2: Function Fallback Using Error Context ---");

  const userResult = await tryCatch(fetchUser, userId);

  // Use error information to provide more context in the fallback
  const safeUser = recover.sync(userResult, (err) => {
    console.log(`Encountered error: ${err.message}`);

    // Create custom guest user based on error type
    if (isErrorType(err.raw, NotFoundError)) {
      // Access typed error data
      const { entityType, id } = err.raw.data;
      return {
        id: "not-found",
        name: `${entityType} ${id} (Not Found)`,
        email: "unknown@example.com",
      };
    }

    return {
      id: "error",
      name: "Error User",
      email: "error@example.com",
    };
  });

  console.log("User with context:", safeUser.data);

  return safeUser;
}

// Example 3: Async fallback using cached data
async function getUserPostsWithCache(userId: string) {
  console.log("\n--- Example 3: Async Fallback Using Cache ---");

  const cacheKey = `posts-${userId}`;

  // Try to fetch posts from API
  const postsResult = await tryCatch(fetchUserPosts, userId);

  // If API call fails, try to use cached data or generate empty posts
  const safePosts = await recover.async(postsResult, async (err) => {
    const endpoint =
      isErrorType(err.raw, NetworkError) && err.raw.data.endpoint
        ? err.raw.data.endpoint
        : "unknown endpoint";

    console.log(`Posts fetch failed for ${endpoint}: ${err.message}`);

    // Check if we have cached data
    if (cache.has(cacheKey)) {
      console.log("Using cached posts data");
      return cache.get(cacheKey) as Post[];
    }

    console.log("No cached data available, returning empty posts");
    return [] as Post[];
  });

  const posts = safePosts.data;

  // Update cache with successful result
  if (posts.length > 0) {
    cache.set(cacheKey, posts);
    console.log("Updated cache with new posts data");
  }

  console.log(`Retrieved ${posts.length} posts`);

  return safePosts;
}

// Example 4: Chaining recovers for a workflow
async function completeUserWorkflow(userId: string) {
  console.log("\n--- Example 4: Chaining Recovers ---");

  // Get user profile with fallback
  const userResult = await tryCatch(fetchUser, userId);
  const safeUser = recover.sync(userResult, {
    id: "guest",
    name: "Guest User",
    email: "guest@example.com",
  });

  const user = safeUser.data;

  // Get user posts with fallback
  const postsResult = await tryCatch(fetchUserPosts, user.id);
  const safePosts = await recover.async(postsResult, async () => {
    return [] as Post[];
  });

  const posts = safePosts.data;

  // Process results (always succeeds due to recover)
  const combinedData: WorkflowResult = {
    user,
    posts,
    summary: `${user.name} has ${posts.length} posts`,
  };

  console.log("Workflow completed successfully");
  console.log("Combined data:", combinedData.summary);

  return Result.success(combinedData);
}

// Run all examples in sequence
async function runExamples() {
  try {
    // Success case
    await getUserProfile("123");

    // Error case with function fallback
    await getUserWithErrorContext("invalid");

    // Async fallback case
    await getUserPostsWithCache("123");

    // Chained workflow
    await completeUserWorkflow("123");

    // Error in chained workflow
    await completeUserWorkflow("invalid");
  } catch (err) {
    // This shouldn't happen because recover prevents errors from propagating
    console.error("Unexpected error:", err);
  }
}

// Execute examples
runExamples().then(() => console.log("\nAll examples completed!"));
