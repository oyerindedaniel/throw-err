# throw-err

A TypeScript error handling utility that maintains proper type inference for errors in async functions.

## The Problem

TypeScript can infer return types of async functions by default, but not error types when using `throw`. This leads to untyped error handling:

```typescript
// Problem: Error types aren't tracked in the type system
async function fetchUser(id: string) {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error("Failed to fetch user"); // Error type is lost
  return await response.json();
}

try {
  const user = await fetchUser("123");
} catch (error) {
  // error is of type 'unknown' or 'any'
  // We don't know what specific errors might occur
}
```

## The Solution

`throw-err` provides utilities that maintain proper type information for errors:

```typescript
// Solution: Error types are properly tracked
import { asyncFn, tryCatch, mkErrClass } from "throw-err";

// Create a custom error class with additional properties
interface FetchErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}
const FetchError = mkErrClass<FetchErrorData>("FetchError", "FETCH_ERROR", {
  status: 0,
  url: "",
});

// Create a typed async function
const fetchUser = asyncFn<FetchError>()(async (id: string) => {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) {
    throw new FetchError("Failed to fetch user", {
      data: {
        status: response.status,
        url: `/api/users/${id}`,
      },
    });
  }
  return await response.json();
});

// Execute with type safety
const result = await tryCatch(fetchUser, "123");
if (result.success) {
  console.log(result.data);
} else {
  // The error is properly typed as FetchError
  console.error(
    `Error ${result.error.code}: ${result.error.message}`,
    `Status: ${result.error.raw.data.status}`,
    `URL: ${result.error.raw.data.url}`
  );
}
```

## Installation

```bash
npm install throw-err
# or
yarn add throw-err
# or
pnpm add throw-err
```

## Key Features

- **Properly typed errors** in async functions
- **Result pattern** for functional error handling
- **Error factory utilities** for creating domain-specific errors
- **Custom error properties** with full type safety
- **Composable utilities** that work well together
- **Fully typed mapper functions** with ergonomic API
- **Zero runtime type checking** for all transformations
- **Zero dependencies** and fully tree-shakeable

## Basic Usage

```typescript
import {
  asyncFn,
  tryCatch,
  mapResult,
  catchErr,
  mkErrClass,
  mapperFn,
} from "throw-err";

// Define a function that might throw DatabaseError
const getUser = asyncFn<DatabaseError>()(async (id: number) => {
  // Implementation...
  return { id, name: "John" };
});

// Use tryCatch to execute and get a Result
const result = await tryCatch(getUser, 123);

// Check success/failure and handle appropriately
if (result.success) {
  console.log(`User: ${result.data.name}`);
} else {
  console.error(`Error: ${result.error.message}`);
}

// Create a typed mapper function with specific error type
const ParseError = mkErrClass("ParseError", "PARSE_ERROR");
const formatUser = mapperFn<InstanceType<typeof ParseError>>()((user) => {
  try {
    return JSON.stringify(user);
  } catch (err) {
    throw new ParseError("Failed to format user");
  }
});

// Type safety without explicit type parameters
const formattedResult = await mapResult(result, formatUser);

// Handle both original and mapper errors with proper typing
if (!formattedResult.success) {
  if (formattedResult.error.raw instanceof ParseError) {
    console.error("Formatting error:", formattedResult.error.message);
  } else {
    console.error("Database error:", formattedResult.error.message);
  }
}

// Recover from errors
const safeResult = await catchErr(result, () => ({
  success: true,
  data: { id: 0, name: "Guest" },
}));
```

## Documentation

See [DOCUMENTATION.md](./DOCUMENTATION.md) for detailed usage and examples.

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the package:
   ```bash
   pnpm build
   ```
4. Run tests:
   ```bash
   pnpm test
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

## License

MIT
