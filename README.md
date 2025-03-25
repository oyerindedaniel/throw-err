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

`throw-err` solves this with a simple yet powerful approach: the `tryCatch` function captures both success values AND error types, making them visible to TypeScript.

```typescript
// Solution: Complete type safety for both success and errors
import { asyncFn, tryCatch, mkErrClass } from "throw-err";

// Define a typed error
const ApiError = mkErrClass("ApiError", "API_ERROR");

// Create a function with known error type
const getUser = asyncFn<ApiError>()(async (id) => {
  // Simulate API call that might fail
  if (id === "invalid") {
    throw new ApiError("User not found");
  }
  return { name: "John", email: "john@example.com" };
});

// Now errors are fully typed!
const result = await tryCatch(getUser, "123");
if (result.success) {
  console.log(result.data.name); // TypeScript knows the shape
} else {
  console.error(result.error.code); // Error properties are typed too!
}
```

### Real-World Examples

Let's see how this works with real APIs:

```typescript
// Solution: Error types are properly tracked
import { asyncFn, tryCatch, mkErrClass } from "throw-err";

// Create a custom error class with additional properties
interface FetchErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}
const FetchError = mkErrClass<FetchErrorData>("FetchError", "FETCH_ERROR", {
  status: 500,
  url: "/api/unknown",
});

function createFetchUser<T>() {
  return asyncFn<InstanceType<typeof FetchError>>()(
    async (id: string): Promise<T> => {
      const response: Response = await fetch(`/api/users/${id}`);

      if (!response.ok) {
        throw new FetchError("Failed to fetch user", {
          data: {
            status: response.status,
            url: `/api/users/${id}`,
          },
        });
      }

      return response.json() as Promise<T>;
    }
  );
}

const fetchUser = createFetchUser<User>();

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

That's great for handling the browser's native fetch API, but what if you're using more modern HTTP clients? Let's supercharge our example with axios!

```typescript
// Elevating our solution with axios - cleaner and more powerful
import { asyncFn, tryCatch, mkErrClass } from "throw-err";
import axios from "axios";

// Create a custom error class with rich details
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}
const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 500,
  url: "/api/unknown",
});

// Type definitions
type User = { id: string; name: string; email: string };

// The magic happens here - no factory function needed!
// Axios's built-in generics work seamlessly with asyncFn
const fetchUserWithAxios = asyncFn<InstanceType<typeof ApiError>>()(
  async (id: string) => {
    try {
      // Look how clean this is - type flows automatically
      const response = await axios.get<User>(`/api/users/${id}`);
      return response.data; // TypeScript knows this is User!
    } catch (err) {
      if (axios.isAxiosError(err)) {
        throw new ApiError("API request failed", {
          data: {
            status: err.response?.status || 500,
            url: `/api/users/${id}`,
          },
        });
      }
      throw new ApiError("Unknown error occurred");
    }
  }
);

// Execute with type safety - even simpler than before
const result = await tryCatch(fetchUserWithAxios, "123");
if (result.success) {
  console.log(result.data.name); // Full autocomplete on User properties
} else {
  // Error handling with complete type information
  console.error(
    `Error ${result.error.code}: ${result.error.message}`,
    `Status: ${result.error.raw.data.status}`
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

## Beyond Basic Usage: Transforming & Recovering

Now that you've seen how to create type-safe async functions, let's explore the powerful transformation and recovery APIs:

```typescript
import {
  asyncFn,
  tryCatch,
  mapResult,
  catchErr,
  mkErrClass,
  mapperFn,
} from "throw-err";

// Define our domain-specific error types
interface DatabaseErrorData {
  table: string;
  query: string;
}
const DatabaseError = mkErrClass<DatabaseErrorData>(
  "DatabaseError",
  "DB_ERROR",
  {
    table: "unknown",
    query: "unknown",
  }
);

interface ValidationErrorData {
  field: string;
  issue: string;
}
const ValidationError = mkErrClass<ValidationErrorData>(
  "ValidationError",
  "VALIDATION_ERROR",
  {
    field: "unknown",
    issue: "unknown",
  }
);

// Original function with DatabaseError
const fetchUserData = asyncFn<InstanceType<typeof DatabaseError>>()(
  async (userId: string) => {
    // Simulate database call that might fail
    if (userId === "invalid") {
      throw new DatabaseError("User not found", {
        data: { table: "users", query: `id = ${userId}` },
      });
    }
    return { id: userId, name: "John Doe", createdAt: "2023-01-15" };
  }
);

async function processUserData(userId: string) {
  // Get initial result - could contain DatabaseError
  const userResult = await tryCatch(fetchUserData, userId);

  // ✨ Transform the data with mapResult
  // Notice how the implementation gives you a union type of errors (DatabaseError | ValidationError)
  const processedResult = await mapResult(
    userResult,
    // This mapper can throw ValidationError
    mapperFn<InstanceType<typeof ValidationError>>()(async (user) => {
      // Validate the user data
      if (!user.createdAt) {
        throw new ValidationError("Invalid user data", {
          data: { field: "createdAt", issue: "Missing field" },
        });
      }

      // Process data
      const date = new Date(user.createdAt);

      // Mapper might throw an error
      if (isNaN(date.getTime())) {
        throw new ValidationError("Invalid date format", {
          data: { field: "createdAt", issue: "Not a valid date string" },
        });
      }

      // Return transformed data
      return {
        ...user,
        displayName: user.name.toUpperCase(),
        accountAge: Math.floor(
          (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)
        ),
      };
    })
  );

  // Now processedResult has type Result<ProcessedUser, DatabaseError | ValidationError>

  // 🛡️ Handle errors with catchErr
  // Note: catchErr replaces the error type entirely with the new error type
  const safeResult = await catchErr(processedResult, (error) => {
    // We can inspect the original error's type
    if (error.raw instanceof DatabaseError) {
      console.log(`Database error: table=${error.raw.data.table}`);
      return {
        success: true,
        data: {
          id: "guest",
          name: "Guest",
          displayName: "GUEST",
          accountAge: 0,
        },
      };
    }

    if (error.raw instanceof ValidationError) {
      console.log(
        `Validation error: ${error.raw.data.field} - ${error.raw.data.issue}`
      );

      // We could throw a different error in the handler if needed
      // throw new BusinessLogicError("Could not process user data");

      return {
        success: true,
        data: {
          id: userId,
          name: "Invalid User",
          displayName: "INVALID USER",
          accountAge: 0,
        },
      };
    }

    // Default fallback
    return {
      success: true,
      data: {
        id: "error",
        name: "Error",
        displayName: "ERROR",
        accountAge: 0,
      },
    };
  });

  // Now safeResult has replaced the error type completely
  // safeResult type is Result<ProcessedUser | RecoveredUser, NewErrorType>

  return safeResult.data; // Always safe to access
}

// Usage examples
console.log(await processUserData("123")); // Normal flow
console.log(await processUserData("invalid")); // DatabaseError -> recovery
console.log(await processUserData("bad-date")); // ValidationError -> recovery
```

### Understanding the Type Flow

The key implementation details that make this work:

1. `mapResult<T, U, E, M>` takes a result with error type `E` and a `MapperFn` that may throw `M`:

   ```typescript
   // Simplified implementation
   function mapResult<T, U, E extends Error, M extends Error>(
     result: Result<T, E>,
     mapper: MapperFn<T, U, M> // Not a raw function, but a MapperFn!
   ): Promise<Result<U, E | M>>;
   ```

   - The `MapperFn` is a wrapper that preserves type information
   - If the original result failed, it returns the original error
   - If the mapper throws, you get the new error
   - Returns a union of both error types: `E | M`

2. `catchErr<T, R, E, F>` takes a result with error type `E` and a handler that returns a result with error type `F`:
   ```typescript
   // Simplified implementation
   function catchErr<T, R, E extends Error, F extends Error>(
     result: Result<T, E>,
     handler: (error: ResultError<E>) => Result<R, F>
   ): Promise<Result<T | R, F>>;
   ```
   - If the original result succeeded, it returns that result
   - If it failed, the handler processes the error
   - Returns a union of data types `T | R`, but only the new error type `F`

This approach gives you full control over error handling while maintaining type safety throughout your application.

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

## License

MIT
