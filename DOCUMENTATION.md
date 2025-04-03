# throw-err Documentation (outdated)

## Table of Contents

- [Core Types](#core-types)
- [Core Functions](#core-functions)
- [Helper Utilities](#helper-utilities)
- [Error Utilities](#error-utilities)
- [Examples](#examples)

## Core Types

### Result<T, E>

Represents the outcome of an operation that can either succeed with data or fail with a typed error.

```typescript
type Result<T, E extends Error> =
  | { success: true; data: T }
  | { success: false; error: ResultError<E> };

interface ResultError<E extends Error> {
  raw: E; // The original error object
  message: string; // Error message
  code?: string; // Error code (if available)
}
```

### AsyncFnWithErr<T, E, Args>

A wrapper for async functions that may throw errors of type E and accept arguments of types Args.

```typescript
class AsyncFnWithErr<T, E extends Error, Args extends readonly unknown[]> {
  constructor(public fn: (...args: Args) => Promise<T>) {}
}
```

### MapperFn<T, U, M>

A wrapper for mapper functions that may throw errors of type M, providing type safety for transformation operations.

```typescript
class MapperFn<T, U, M extends Error> {
  constructor(public fn: (data: T) => Promise<U> | U) {}
}
```

## Core Functions

### asyncFn<E>()

Creates an `AsyncFnWithErr` instance for a given async function, specifying the error type E.

```typescript
function asyncFn<E extends Error>() {
  return <T, Args extends readonly unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): AsyncFnWithErr<T, E, Args> => {
    return new AsyncFnWithErr<T, E, Args>(fn);
  };
}
```

**Example:**

```typescript
const fetchUser = asyncFn<FetchError>()(async (id: string) => {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new FetchError("Failed to fetch user");
  return await response.json();
});
```

### tryCatch<T, E, Args>()

Executes a wrapped function with arguments, returning a `Result<T, E>`.

```typescript
async function tryCatch<T, E extends Error, Args extends readonly unknown[]>(
  wrappedFn: AsyncFnWithErr<T, E, Args>,
  ...args: Args
): Promise<Result<T, E>>;
```

**Example:**

```typescript
const result = await tryCatch(fetchUser, "123");
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

### mapperFn<M>()

Creates a `MapperFn` instance for a given mapper function, specifying the error type M.

```typescript
function mapperFn<M extends Error>() {
  return <T, U>(fn: (data: T) => Promise<U> | U): MapperFn<T, U, M> => {
    return new MapperFn<T, U, M>(fn);
  };
}
```

**Example:**

```typescript
const parseJson = mapperFn<ParseError>()((text: string) => {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ParseError("Failed to parse JSON");
  }
});

// The error type is already captured in the parseJson function
const result = await mapResult(jsonResponse, parseJson);
```

## Enhanced Error Handling in Transformations

One of the key features of throw-err is its ability to properly type and handle errors from mapper functions in transformations. Both `mapResult` and `flatMapResult` provide full type safety for:

1. **Original errors** from the input Result
2. **Mapper-thrown errors** that occur during transformation
3. **Nested Result errors** (for flatMapResult)

This ensures that all potential error paths are properly typed and can be handled with appropriate type narrowing:

```typescript
// Define error types
const ApiError = mkErrClass("ApiError", "API_ERROR");
const ParseError = mkErrClass("ParseError", "PARSE_ERROR");
const ValidationError = mkErrClass("ValidationError", "VALIDATION_ERROR");

// Get a result that might have ApiError
const userResult = await tryCatch(fetchUser, "123");

// Transform it with a mapper that might throw ParseError
const jsonResult = await mapResult<
  User,
  object,
  ApiErrorInstance,
  ParseErrorInstance
>(userResult, (user) => {
  // This might throw ParseError
  return JSON.parse(JSON.stringify(user));
});

// Chain with another result that might have ValidationError
// The mapper function itself might throw TypeError
const validatedResult = await flatMapResult<
  object,
  ValidUser,
  ApiErrorInstance | ParseErrorInstance,
  ValidationErrorInstance,
  TypeError
>(jsonResult, (data) => {
  // Might throw TypeError
  if (typeof data !== "object") throw new TypeError("Invalid data");

  // Or return a Result with ValidationError
  return tryCatch(validateUser, data);
});

// Type-safe error handling with all possible error types
if (!validatedResult.success) {
  const err = validatedResult.error;

  if (err.raw instanceof ApiError) {
    // Handle API error
  } else if (err.raw instanceof ParseError) {
    // Handle Parse error
  } else if (err.raw instanceof ValidationError) {
    // Handle Validation error
  } else if (err.raw instanceof TypeError) {
    // Handle Type error from the flatMap mapper function
  }
}
```

This approach ensures that no error is ever "lost" in the type system, allowing for comprehensive error handling.

## Helper Utilities

### mapResult<T, U, E, M>()

Transforms the success value of a Result. The improved version uses `MapperFn` to provide better type safety.

```typescript
// New approach with MapperFn
async function mapResult<T, U, E extends Error, M extends Error>(
  result: Result<T, E>,
  mapper: MapperFn<T, U, M>
): Promise<Result<U, E | M>>;

// Legacy approach (still supported)
async function mapResult<T, U, E extends Error, F extends Error = Error>(
  result: Result<T, E>,
  mapper: (data: T) => Promise<U> | U
): Promise<Result<U, E | F>>;
```

**Example using the new approach:**

```typescript
const userResult = await tryCatch(fetchUser, "123");

// Create a typed mapper function
const toUserProfile = mapperFn<TransformError>()((user) => {
  if (!user.name) throw new TransformError("User name is required");
  return {
    displayName: user.name,
    initials: user.name
      .split(" ")
      .map((n) => n[0])
      .join(""),
  };
});

// Type safety without needing to specify error types explicitly
const profileResult = await mapResult(userResult, toUserProfile);

// Type system knows both possible error types
if (!profileResult.success) {
  if (profileResult.error.raw instanceof FetchError) {
    console.error(`Fetch error: ${profileResult.error.message}`);
  } else if (profileResult.error.raw instanceof TransformError) {
    console.error(`Transform error: ${profileResult.error.message}`);
  }
}
```

### flatMapResult<T, U, E, F, M>()

Chains operations where the mapper returns a Result. The improved version uses `MapperFn` to provide better type safety.

```typescript
// New approach with MapperFn
async function flatMapResult<
  T,
  U,
  E extends Error,
  F extends Error,
  M extends Error
>(
  result: Result<T, E>,
  mapper: MapperFn<T, Result<U, F>, M>
): Promise<Result<U, E | F | M>>;

// Legacy approach (still supported)
async function flatMapResult<
  T,
  U,
  E extends Error,
  F extends Error,
  G extends Error = Error
>(
  result: Result<T, E>,
  mapper: (data: T) => Promise<Result<U, F>> | Result<U, F>
): Promise<Result<U, E | F | G>>;
```

**Example using the new approach:**

```typescript
const userResult = await tryCatch(fetchUser, "123");

// Create a typed mapper function that returns a Result
const getUserPosts = mapperFn<DatabaseError>()((user) => {
  if (!user.id) throw new DatabaseError("Invalid user ID");
  return tryCatch(fetchUserPosts, user.id);
});

// Type safety without needing to specify all error types explicitly
const postsResult = await flatMapResult(userResult, getUserPosts);

// Type system knows all three possible error types
if (!postsResult.success) {
  if (postsResult.error.raw instanceof FetchError) {
    // Original error from userResult
    console.error("Failed to fetch user");
  } else if (postsResult.error.raw instanceof NotFoundError) {
    // Error from the nested tryCatch in getUserPosts
    console.error("Posts not found");
  } else if (postsResult.error.raw instanceof DatabaseError) {
    // Error thrown by the mapper function itself
    console.error(`Database error: ${postsResult.error.raw.message}`);
  }
}
```

### catchErr<T, R, E, F>()

Recovers from errors by transforming them or providing fallback data of potentially different type.

```typescript
async function catchErr<T, R, E extends Error, F extends Error>(
  result: Result<T, E>,
  handler: (error: ResultError<E>) => Promise<Result<R, F>> | Result<R, F>
): Promise<Result<T | R, F>>;
```

**Example:**

```typescript
// 1. Recovery with same type
const userResult = await tryCatch(fetchUser, "123");
const safeResult = await catchErr(userResult, () => ({
  success: true,
  data: { id: "123", name: "Guest User" }, // Same User type
}));

// 2. Recovery with different type
const postsResult = await tryCatch(fetchPosts, "123");
const fallbackResult = await catchErr(postsResult, () => ({
  success: true,
  data: [], // Different type (empty array instead of Post[])
}));

// 3. Error transformation (instead of recovery)
const apiResult = await tryCatch(fetchApi);
const transformedResult = await catchErr<UserData, never, ApiError, AppError>(
  apiResult,
  (apiError) => ({
    success: false, // Not recovering, but transforming error
    error: {
      raw: new AppError(`App error: ${apiError.message}`),
      message: `Application error: ${apiError.message}`,
      code: "APP_ERROR",
    },
  })
);
```

### mapErr<T, E, F>()

Transforms the error type in a Result.

```typescript
function mapErr<T, E extends Error, F extends Error>(
  result: Result<T, E>,
  mapper: (error: E) => F
): Result<T, F>;
```

**Example:**

```typescript
const result = await tryCatch(fetchUser, "123");
const mappedErr = mapErr(result, (err) => new AppError(err.message));
```

### retry<T, E>()

Retries a function on failure.

```typescript
async function retry<T, E extends Error, Args extends readonly unknown[]>(
  wrappedFn: AsyncFnWithErr<T, E, Args>,
  retries: number,
  options: { delay?: number; exponential?: boolean } = {},
  ...args: Args
): Promise<Result<T, E>>;
```

**Example:**

```typescript
const result = await retry(
  fetchUser,
  3,
  { delay: 1000, exponential: true },
  "123"
);
```

### timeout<T, E>()

Adds a timeout with a custom TimeoutError.

```typescript
async function timeout<T, E extends Error, Args extends readonly unknown[]>(
  wrappedFn: AsyncFnWithErr<T, E, Args>,
  ms: number,
  ...args: Args
): Promise<Result<T, E | TimeoutError>>;
```

**Example:**

```typescript
const result = await timeout(fetchUser, 5000, "123");
```

### compose<T1, T2, E1, E2>()

Composes two async functions, merging their error types into a union.

```typescript
function compose<
  T1,
  T2,
  E1 extends Error,
  E2 extends Error,
  Args1 extends readonly unknown[]
>(
  fn1: AsyncFnWithErr<T1, E1, Args1>,
  fn2: (input: T1) => AsyncFnWithErr<T2, E2, readonly unknown[]>
): AsyncFnWithErr<T2, E1 | E2, Args1>;
```

**Example:**

```typescript
const fetchUserPosts = compose(fetchUser, (user) =>
  asyncFn<PostError>()(async () => {
    const response = await fetch(`/api/users/${user.id}/posts`);
    if (!response.ok) throw new PostError("Failed to fetch posts");
    return await response.json();
  })
);

// Combined error type is FetchError | PostError
const result = await tryCatch(fetchUserPosts, "123");
```

## Composition Functions

The library provides three powerful composition functions that help you combine operations while preserving type safety:

### `compose<T, E, Args, W1E, W2E, W3E>(...wrappers)(fn)`

Compose multiple async function wrappers into a single wrapper with improved error type handling. This function properly tracks and accumulates error types from each wrapper.

```typescript
// Type-safe composition with explicit error types
const getUserWithRetryAndTimeout = compose<
  User, // Return type
  UserError, // Base error type
  [string], // Argument types
  NetworkError, // Additional errors from withRetry
  TimeoutError // Additional errors from withTimeout
>(
  withRetry,
  withTimeout
)(fetchUserById);

// Result type is AsyncFnWithErr<User, UserError | NetworkError | TimeoutError, [string]>
```

### `composeMany<T, E, Args, WE>(...wrappers)(fn)`

A variadic version of compose that supports an arbitrary number of wrappers. This version doesn't track specific error types from each wrapper but provides a simpler API for cases where precise error typing isn't needed.

```typescript
// Simpler composition for many wrappers
const enhancedFn = composeMany<
  User, // Return type
  UserError, // Base error type
  [string], // Argument types
  NetworkError | TimeoutError // All possible additional errors
>(
  withRetry,
  withTimeout,
  withLogging,
  withMetrics
)(fetchUserById);
```

### `composeFns<T1, T2, E1, E2, Args1>(fn1, fn2)`

Directly compose two async functions by passing the output of the first to the second while properly combining their error types:

```typescript
const fetchUserPosts = composeFns(fetchUser, (user) =>
  asyncFn<PostError>()(async () => {
    const response = await fetch(`/api/users/${user.id}/posts`);
    if (!response.ok) throw new PostError("Failed to fetch posts");
    return await response.json();
  })
);

// Combined error type is UserError | PostError
const result = await tryCatch(fetchUserPosts, "123");
```

## Error Utilities

### mkErrClass<T>()

Creates custom error classes that can store additional properties of type T.

The function has two overloads:

1. For simple errors (without additional data):

```typescript
function mkErrClass(
  name: string,
  defaultCode?: string
): ErrorClassConstructor<Record<string, never>>;
```

2. For typed errors (with additional data properties):

```typescript
function mkErrClass<T extends Record<string, unknown>>(
  name: string,
  defaultCode: string | undefined,
  defaultData: T
): ErrorClassConstructor<T>;
```

**Example:**

```typescript
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

// When using typed data properties, default values are required
const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 0,
  url: "",
});

// Simple errors without extra data don't need default values
const SimpleError = mkErrClass("SimpleError", "SIMPLE_ERROR");

throw new ApiError("API request failed", {
  data: {
    status: 404,
    url: "https://api.example.com/users",
  },
});
```

### withCode<E>()

Decorates a function to attach an error code to any errors it throws.

```typescript
function withCode<E extends Error>(code: string) {
  return <T, Args extends readonly unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): AsyncFnWithErr<T, E, Args>
}
```

**Example:**

```typescript
const fetchWithCode = withCode<FetchError>("FETCH_ERROR")(
  async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new FetchError("Failed to fetch");
    return res.json();
  }
);
```

### normalizeError<E>()

Normalizes any error into a consistent ResultError format, handling different error types.

```typescript
function normalizeError<E extends Error = Error>(
  error: unknown
): ResultError<E>;
```

**Example:**

```typescript
try {
  // This could throw anything - Error object, string, null, etc.
  await riskyOperation();
} catch (err) {
  // Convert to a consistent format
  const normalized = normalizeError(err);
  console.log(normalized.message); // Always available
  console.log(normalized.code); // Always available
  console.log(normalized.raw); // The original error
}
```

### normalizeTypedError<T>()

Type-safe version of normalizeError that preserves the specific error type when you already know the error type.

```typescript
function normalizeTypedError<T extends Error>(error: T): ResultError<T>;
```

**Example:**

```typescript
// When you know the specific error type
const apiError = new ApiError("Not found", {
  data: { status: 404, url: "/api/resource" },
});

// This preserves the full type information
const normalized = normalizeTypedError(apiError);

// TypeScript knows this is available - no type assertion needed
console.log(normalized.raw.data.status);
```

### isResultError()

Checks if an object is a ResultError with a valid Error in its `raw` property.

```typescript
function isResultError(obj: unknown): boolean;
```

**Example:**

```typescript
// Use to check if you already have a ResultError
const error = getErrorFromSomewhere();
if (isResultError(error)) {
  // It's already a ResultError, use as is
  console.log(error.message, error.code);
} else {
  // Normalize it
  const normalized = normalizeError(error);
  console.log(normalized.message, normalized.code);
}
```

## Examples

### Basic Error Handling

```typescript
import { asyncFn, tryCatch } from "throw-err";

// Define a function that might throw an error
const divide = asyncFn<Error>()(async (a: number, b: number) => {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
});

// Execute with tryCatch to get a Result
const result = await tryCatch(divide, 10, 0);

// Handle success or failure
if (result.success) {
  console.log(`Result: ${result.data}`);
} else {
  console.error(`Error: ${result.error.message}`);
}
```

### Custom Error with Extra Properties

```typescript
import { asyncFn, tryCatch, mkErrClass } from "throw-err";

// Define a custom error type with extra properties
interface DatabaseErrorData extends Record<string, unknown> {
  table: string;
  query: string;
  code: number;
}

// Create a custom error class
const DatabaseError = mkErrClass<DatabaseErrorData>(
  "DatabaseError",
  "DB_ERROR",
  { table: "", query: "", code: 0 }
);

// Define a function that might throw the custom error
const queryDatabase = asyncFn<DatabaseError>()(async (query: string) => {
  if (query.includes("DROP")) {
    throw new DatabaseError("Dangerous query detected", {
      data: {
        table: "users",
        query,
        code: 403,
      },
    });
  }
  return [{ id: 1, name: "User 1" }];
});

// Execute with tryCatch
const result = await tryCatch(queryDatabase, "DROP TABLE users");

// Handle success or failure
if (!result.success) {
  console.error(`Database error: ${result.error.message}`);
  console.error(`Table: ${result.error.raw.data.table}`);
  console.error(`Query: ${result.error.raw.data.query}`);
  console.error(`Code: ${result.error.raw.data.code}`);
}
```

### Composition and Error Handling

```typescript
import {
  asyncFn,
  tryCatch,
  compose,
  mkErrClass,
  mapResult,
  catchErr,
} from "throw-err";

// Define custom error types
const NetworkError = mkErrClass("NetworkError", "NETWORK_ERROR");
const ValidationError = mkErrClass("ValidationError", "VALIDATION_ERROR");

// Define a function to fetch a user
const fetchUser = asyncFn<NetworkError>()(async (id: string) => {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) {
      throw new NetworkError(`Failed to fetch user with id ${id}`);
    }
    return await response.json();
  } catch (err) {
    if (err instanceof Error) {
      throw new NetworkError(err.message);
    }
    throw new NetworkError("Unknown network error");
  }
});

// Define a function to validate a user
const validateUser = asyncFn<ValidationError>()(async (user: any) => {
  if (!user.name) {
    throw new ValidationError("User name is required");
  }
  if (!user.email) {
    throw new ValidationError("User email is required");
  }
  return user;
});

// Compose the functions
const getUserAndValidate = compose(fetchUser, (user) => validateUser);

// Execute with tryCatch
const result = await tryCatch(getUserAndValidate, "123");

// Handle different error types
if (!result.success) {
  if (result.error.raw instanceof NetworkError) {
    console.error(`Network error: ${result.error.message}`);
  } else if (result.error.raw instanceof ValidationError) {
    console.error(`Validation error: ${result.error.message}`);
  }
}

// Transform the result
const userNameResult = await mapResult(result, (user) => user.name);

// Provide a fallback on error
const safeResult = await catchErr(result, () => ({
  success: true,
  data: { id: "123", name: "Guest", email: "guest@example.com" },
}));
```

### Advanced Retry with Exponential Backoff

```typescript
import { asyncFn, tryCatch, retry, mkErrClass } from "throw-err";

// Define a custom error
const ServiceError = mkErrClass("ServiceError", "SERVICE_ERROR");

// Create a flaky service function
const flakyService = asyncFn<ServiceError>()(async (id: string) => {
  // Simulate random failures
  if (Math.random() < 0.7) {
    throw new ServiceError("Service temporarily unavailable");
  }
  return { id, data: "Some data" };
});

// Use retry with exponential backoff
const result = await retry(
  flakyService,
  5, // 5 retries
  {
    delay: 100, // Start with 100ms delay
    exponential: true, // Use exponential backoff (100ms, 200ms, 400ms, 800ms, 1600ms)
  },
  "123"
);

if (result.success) {
  console.log("Service call succeeded after retries");
  console.log(result.data);
} else {
  console.error("Service call failed after all retries");
}
```
