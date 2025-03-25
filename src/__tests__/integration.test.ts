import {
  asyncFn,
  tryCatch,
  mkErrClass,
  mapResult,
  flatMapResult,
  catchErr,
  composeFns,
  retry,
  timeout,
  TimeoutError,
  withCode,
  mapperFn,
} from "..";

// Create custom error classes for testing
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 0,
  url: "",
});
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");

// Define error instance types
type ApiErrorInstance = InstanceType<typeof ApiError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;

describe("throw-err integration tests", () => {
  // Mock user data API functions
  const mockGetUser = async (id: string) => {
    if (id === "error") {
      throw new ApiError("API error", {
        data: {
          status: 500,
          url: `/api/users/${id}`,
        },
      });
    }
    if (id === "404") {
      throw new ApiError("User not found", {
        data: {
          status: 404,
          url: `/api/users/${id}`,
        },
      });
    }
    return { id, name: `User ${id}` };
  };

  const mockGetPosts = async (userId: string) => {
    if (userId === "noposts") {
      throw new NotFoundError("No posts found");
    }
    return [
      { id: 1, title: `Post 1 for user ${userId}` },
      { id: 2, title: `Post 2 for user ${userId}` },
    ];
  };

  // Create wrapped functions
  const getUser = asyncFn<ApiErrorInstance>()(mockGetUser);
  const getPosts = asyncFn<NotFoundErrorInstance>()(mockGetPosts);

  test("End-to-end workflow with flatMap and composition", async () => {
    // Create a composed function that gets user and posts
    const getUserWithPosts = composeFns(getUser, (user) =>
      asyncFn<NotFoundErrorInstance>()(async () => {
        const posts = await mockGetPosts(user.id);
        return { ...user, posts };
      })
    );

    // Test with successful case
    const successResult = await tryCatch(getUserWithPosts, "123");
    expect(successResult.success).toBe(true);
    if (successResult.success) {
      expect(successResult.data).toHaveProperty("posts");
      expect(successResult.data.posts).toHaveLength(2);
    }

    // Test with API error
    const apiErrorResult = await tryCatch(getUserWithPosts, "error");
    expect(apiErrorResult.success).toBe(false);
    if (!apiErrorResult.success) {
      expect(apiErrorResult.error.raw).toBeInstanceOf(ApiError);
      expect(apiErrorResult.error.code).toBe("API_ERROR");
    }

    // Test with not found error in the second step
    const notFoundResult = await tryCatch(getUserWithPosts, "noposts");
    expect(notFoundResult.success).toBe(false);
    if (!notFoundResult.success) {
      expect(notFoundResult.error.raw).toBeInstanceOf(NotFoundError);
      expect(notFoundResult.error.code).toBe("NOT_FOUND");
    }
  });

  test("Error recovery with catchErr - same and different types", async () => {
    // Recovery with same type
    const userResult = await tryCatch(getUser, "404");
    expect(userResult.success).toBe(false);

    const userRecovered = await catchErr(userResult, () => ({
      success: true,
      data: { id: "404", name: "Guest User" },
    }));

    expect(userRecovered.success).toBe(true);
    if (userRecovered.success) {
      expect(userRecovered.data.name).toBe("Guest User");
    }

    // Recovery with different type (simplified data)
    interface UserSummary {
      display: string;
      guest: boolean;
    }

    const failedResult = await tryCatch(getUser, "404");
    const simplifiedRecovery = await catchErr<
      { id: string; name: string },
      UserSummary,
      ApiErrorInstance | NotFoundErrorInstance,
      Error
    >(failedResult, (error) => ({
      success: true,
      data: {
        display: `Guest (${error.message})`,
        guest: true,
      },
    }));

    expect(simplifiedRecovery.success).toBe(true);
    if (simplifiedRecovery.success && "guest" in simplifiedRecovery.data) {
      expect(simplifiedRecovery.data.guest).toBe(true);
      expect(simplifiedRecovery.data.display).toContain("Guest");
    }
  });

  test("Data transformation with mapResult", async () => {
    const result = await tryCatch(getUser, "123");

    const nameMapper = mapperFn<Error>()(
      (user: { id: string; name: string }) => user.name
    );
    const nameOnly = await mapResult(result, nameMapper);

    expect(nameOnly.success).toBe(true);
    if (nameOnly.success) {
      expect(nameOnly.data).toBe("User 123");
    }
  });

  test("Function chaining with flatMapResult", async () => {
    const result = await tryCatch(getUser, "123");

    const postsMapper = mapperFn<NotFoundErrorInstance>()(
      (user: { id: string; name: string }) => tryCatch(getPosts, user.id)
    );

    const userWithPosts = await flatMapResult(result, postsMapper);

    expect(userWithPosts.success).toBe(true);
    if (userWithPosts.success) {
      const posts = userWithPosts.data;
      expect(posts).toHaveLength(2);
      expect(posts[0].title).toBe("Post 1 for user 123");
    }
  });

  test("Retry functionality", async () => {
    let attempts = 0;

    const flakyFn = asyncFn<Error>()(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return "Success after retries";
    });

    const result = await retry(flakyFn, 3);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Success after retries");
    }
    expect(attempts).toBe(3);
  });

  test("Timeout functionality", async () => {
    jest.useFakeTimers();

    const slowFn = asyncFn<Error>()(async () => {
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve("Finished"), 10000);
      });
    });

    const timeoutPromise = timeout(slowFn, 5000);

    // Fast-forward time
    jest.advanceTimersByTime(6000);

    const result = await timeoutPromise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.raw).toBeInstanceOf(TimeoutError);
      expect(result.error.code).toBe("TIMEOUT_ERROR");
    }

    jest.useRealTimers();
  });

  test("withCode functionality", async () => {
    const fnWithCode = withCode<Error>("CUSTOM_ERROR")(async () => {
      throw new Error("Something went wrong");
    });

    const result = await tryCatch(fnWithCode);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CUSTOM_ERROR");
    }
  });
});
