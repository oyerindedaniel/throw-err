import { Result, ResultError } from "../types/Result";
import {
  promiseToResult,
  map,
  recover,
  tap,
  tapError,
  filterResult,
} from "../utils/resultTransformers";
import { ChainableResult, Success, Failure } from "../utils/chainableResult";
import { CommonErrorCodes } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";

// Define custom error types for our API
const RATE_LIMIT_ERROR_CODE = "RATE_LIMIT_ERROR";

interface ApiErrorData {
  statusCode: number;
  endpoint: string;
}

interface ValidationErrorData {
  field: string;
  reason: string;
}

interface RateLimitErrorData {
  retryAfter: number;
}

const ApiError = mkErrClass<ApiErrorData>(
  "ApiError",
  CommonErrorCodes.NETWORK,
  {
    statusCode: 0,
    endpoint: "",
  }
);

const ValidationError = mkErrClass<ValidationErrorData>(
  "ValidationError",
  CommonErrorCodes.VALIDATION,
  {
    field: "",
    reason: "",
  }
);

const RateLimitError = mkErrClass<RateLimitErrorData>(
  "RateLimitError",
  RATE_LIMIT_ERROR_CODE,
  {
    retryAfter: 0,
  }
);

// User type definition for reuse
interface User {
  id: string;
  name: string;
  email?: string;
}

// Extended user with display name
interface ExtendedUser extends User {
  displayName: string;
}

/**
 * Example API client that we need to integrate with
 */
class ExternalApiClient {
  // This simulates a call to an external API that returns a promise
  fetchUser(id: string): Promise<User> {
    const shouldFail = Math.random() < 0.3;
    const shouldRateLimit = Math.random() < 0.2;

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldRateLimit) {
          const error = new RateLimitError("Rate limit exceeded");
          error.data.retryAfter = 30;
          reject(error);
        } else if (shouldFail) {
          const error = new ApiError(`Failed to fetch user with id ${id}`);
          error.data.statusCode = 404;
          error.data.endpoint = `/users/${id}`;
          reject(error);
        } else {
          resolve({
            id,
            name: `User ${id}`,
            email: Math.random() > 0.3 ? `user${id}@example.com` : undefined,
          });
        }
      }, 100);
    });
  }

  // Another API method that might fail
  updateUser(
    id: string,
    data: { name?: string; email?: string }
  ): Promise<User> {
    const shouldFail = Math.random() < 0.4;

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail) {
          const error = new ApiError(`Failed to update user with id ${id}`);
          error.data.statusCode = 400;
          error.data.endpoint = `/users/${id}`;
          reject(error);
        } else if (data.email && !data.email.includes("@")) {
          const error = new ValidationError("Invalid email address");
          error.data.field = "email";
          error.data.reason = "Email must contain @ symbol";
          reject(error);
        } else {
          resolve({
            id,
            name: data.name || `User ${id}`,
            email: data.email,
          });
        }
      }, 100);
    });
  }
}

// Initialize our API client
const api = new ExternalApiClient();

/**
 * Example 1: Simple Promise to Result conversion with non-chainable approach
 */
async function fetchUserNonChainable(id: string): Promise<Result<User, Error>> {
  console.log("Fetching user with non-chainable approach...");

  // Convert the Promise to a Result
  const userResult = await promiseToResult(api.fetchUser(id));

  // Log the success or failure
  if (userResult.success) {
    console.log("Successfully fetched user:", userResult.data);
  } else {
    console.error("Failed to fetch user:", userResult.error.message);
    if (userResult.error.raw instanceof RateLimitError) {
      console.log(
        `Retry after ${userResult.error.raw.data.retryAfter} seconds`
      );
    }
  }

  return userResult;
}

/**
 * Example 2: More complex non-chainable approach with composition
 */
async function fetchAndProcessUserNonChainable(
  id: string
): Promise<Result<ExtendedUser, Error>> {
  console.log("Fetching and processing user with non-chainable approach...");

  // Convert the Promise to a Result
  const userResult = await promiseToResult(api.fetchUser(id));

  // Add logging side effects
  const loggedResult = tap(userResult, (user: User) => {
    console.log(`Processing user ${user.id} (${user.name})`);
  });

  // Add error logging side effects
  const errorLoggedResult = tapError(
    loggedResult,
    (error: ResultError<Error>) => {
      console.error(`Error fetching user: ${error.message}`);
    }
  );

  // Filter out users without email
  const validatedResult = filterResult(
    errorLoggedResult,
    (user: User) => Boolean(user.email),
    (user: User) => {
      const error = new ValidationError(`User ${user.id} has no email`);
      error.data.field = "email";
      error.data.reason = "Missing required field";
      return error;
    }
  );

  // Map to add display name
  const mappedResult = map(validatedResult, (user: User) => ({
    ...user,
    displayName: `${user.name} <${user.email}>`,
  }));

  // Provide fallback for any errors
  return recover.sync(mappedResult, (error: ResultError<Error>) => {
    if (error.raw instanceof RateLimitError) {
      console.log(
        `Rate limited. Retry after ${error.raw.data.retryAfter} seconds`
      );
    }

    // Always return a fallback user
    return {
      id,
      name: "Unknown User",
      displayName: "Unknown User",
      email: undefined,
    };
  });
}

/**
 * Example 3: Simple chainable approach
 */
async function fetchUserChainable(
  id: string
): Promise<ChainableResult<User, Error>> {
  console.log("Fetching user with chainable approach...");

  // Convert the Promise to a ChainableResult
  return ChainableResult.fromPromise(api.fetchUser(id));
}

/**
 * Example 4: More complex chainable approach with composition
 */
async function fetchAndProcessUserChainable(id: string): Promise<ExtendedUser> {
  console.log("Fetching and processing user with chainable approach...");

  // First await the promise resolution
  const chainableResult = await ChainableResult.fromPromise(api.fetchUser(id));

  // Now we can chain methods
  const processedResult = chainableResult
    .tap((user: User) => {
      console.log(`Processing user ${user.id} (${user.name})`);
    })
    .tapError((error: ResultError<Error>) => {
      console.error(`Error fetching user: ${error.message}`);
    })
    .filter(
      (user: User) => Boolean(user.email),
      (user: User) => {
        const error = new ValidationError(`User ${user.id} has no email`);
        error.data.field = "email";
        error.data.reason = "Missing required field";
        return error;
      }
    )
    .map(
      (user: User): ExtendedUser => ({
        ...user,
        displayName: `${user.name} <${user.email}>`,
      })
    )
    .recoverWithResult((error: ResultError<Error>) => {
      if (error.raw instanceof RateLimitError) {
        console.log(
          `Rate limited. Retry after ${error.raw.data.retryAfter} seconds`
        );
      }

      // Return a fallback user
      return ChainableResult.success({
        id,
        name: "Unknown User",
        displayName: "Unknown User",
        email: undefined,
      });
    });

  // Get the actual value
  return processedResult.getOrElse({
    id,
    name: "Fallback User",
    displayName: "Fallback User",
    email: undefined,
  });
}

/**
 * Example 5: Sequential API calls with non-chainable approach
 */
async function updateUserProfileNonChainable(
  id: string,
  name: string
): Promise<Result<User, Error>> {
  console.log("Updating user profile with non-chainable approach...");

  // First fetch the user
  const userResult = await promiseToResult(api.fetchUser(id));

  if (!userResult.success) {
    return userResult; // Return early if fetch failed
  }

  // Then update with new data
  const updateResult = await promiseToResult(
    api.updateUser(id, {
      name,
      email: userResult.data.email,
    })
  );

  return updateResult;
}

/**
 * Example 6: Sequential API calls with chainable approach
 */
async function updateUserProfileChainable(
  id: string,
  name: string
): Promise<ChainableResult<User, Error>> {
  console.log("Updating user profile with chainable approach...");

  // First fetch the user
  const userResult = await ChainableResult.fromPromise(api.fetchUser(id));

  // Then flat map to update (only if fetch succeeded)
  return userResult.flatMapAsync(async (user: User) => {
    return await ChainableResult.fromPromise(
      api.updateUser(id, {
        name,
        email: user.email,
      })
    );
  });
}

/**
 * Example 7: Parallel API calls with non-chainable approach
 */
async function fetchMultipleUsersNonChainable(
  ids: string[]
): Promise<Result<User[], Error>> {
  console.log("Fetching multiple users with non-chainable approach...");

  // Create an array of promises
  const promises = ids.map((id) => api.fetchUser(id));

  // Convert all promises to a single Result with an array of users
  try {
    const users = await Promise.all(promises);
    return Result.success(users);
  } catch (err) {
    return Result.failure({
      raw: err as Error,
      message: `Failed to fetch one or more users: ${(err as Error).message}`,
      code: CommonErrorCodes.NETWORK,
    });
  }
}

/**
 * Example 8: Parallel API calls with chainable approach
 */
async function fetchMultipleUsersChainable(
  ids: string[]
): Promise<ChainableResult<User[], Error>> {
  console.log("Fetching multiple users with chainable approach...");

  // Create an array of ChainableResults
  const resultPromises = ids.map((id) =>
    ChainableResult.fromPromise(api.fetchUser(id))
  );

  // Wait for all promises to settle
  const results = await Promise.all(resultPromises);

  // Find the first failure, if any
  const failureIndex = results.findIndex((result) => !result.success);

  if (failureIndex >= 0) {
    // Return the first failure
    return results[failureIndex] as Failure<Error>;
  }

  // All succeeded, combine the data
  const users = results.map((result) => (result as Success<User>).data);
  return ChainableResult.success(users);
}

/**
 * Example 9: Retry functionality with non-chainable approach
 */
async function fetchWithRetryNonChainable(
  id: string,
  maxRetries = 3
): Promise<Result<User, Error>> {
  console.log("Fetching with retry (non-chainable)...");

  let lastError: ResultError<Error> | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Attempt ${attempt} of ${maxRetries}...`);

    const result = await promiseToResult(api.fetchUser(id));

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't retry for validation errors
    if (lastError.raw instanceof ValidationError) {
      return result;
    }

    // For rate limit errors, wait the suggested time
    if (lastError.raw instanceof RateLimitError) {
      const waitTime = lastError.raw.data.retryAfter * 1000;
      console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } else {
      // For other errors, wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return Result.failure(lastError!);
}

/**
 * Example 10: Retry functionality with chainable approach
 */
async function fetchWithRetryChainable(
  id: string,
  maxRetries = 3
): Promise<ChainableResult<User, Error>> {
  console.log("Fetching with retry (chainable)...");

  let lastError: ResultError<Error> | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Attempt ${attempt} of ${maxRetries}...`);

    const result = await ChainableResult.fromPromise(api.fetchUser(id));

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't retry for validation errors
    if (lastError.raw instanceof ValidationError) {
      return result;
    }

    // For rate limit errors, wait the suggested time
    if (lastError.raw instanceof RateLimitError) {
      const waitTime = lastError.raw.data.retryAfter * 1000;
      console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } else {
      // For other errors, wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return ChainableResult.failure(lastError!);
}

// Run the examples
async function runExamples() {
  // Example 1
  await fetchUserNonChainable("123");

  // Example 2
  const user2 = await fetchAndProcessUserNonChainable("456");
  console.log("Result from Example 2:", user2);

  // Example 3
  const user3 = await fetchUserChainable("789");
  console.log("Result from Example 3:", user3.toResult());

  // Example 4
  const user4 = await fetchAndProcessUserChainable("101");
  console.log("Result from Example 4:", user4);

  // Example 5
  const user5 = await updateUserProfileNonChainable("202", "Updated Name");
  console.log("Result from Example 5:", user5);

  // Example 6
  const user6 = await updateUserProfileChainable("303", "New Name");
  console.log("Result from Example 6:", user6.toResult());

  // Example 7
  const users7 = await fetchMultipleUsersNonChainable(["404", "505", "606"]);
  console.log("Result from Example 7:", users7);

  // Example 8
  const users8 = await fetchMultipleUsersChainable(["707", "808", "909"]);
  console.log("Result from Example 8:", users8.toResult());

  // Example 9
  const user9 = await fetchWithRetryNonChainable("111");
  console.log("Result from Example 9:", user9);

  // Example 10
  const user10 = await fetchWithRetryChainable("222");
  console.log("Result from Example 10:", user10.toResult());
}

// Don't automatically run in module context
// Uncomment this line to run when executing this file directly
// runExamples().catch(console.error);

// Export the examples for use elsewhere
export {
  fetchUserNonChainable,
  fetchAndProcessUserNonChainable,
  fetchUserChainable,
  fetchAndProcessUserChainable,
  updateUserProfileNonChainable,
  updateUserProfileChainable,
  fetchMultipleUsersNonChainable,
  fetchMultipleUsersChainable,
  fetchWithRetryNonChainable,
  fetchWithRetryChainable,
  runExamples,
};
