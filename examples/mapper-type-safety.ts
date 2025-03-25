import {
  asyncFn,
  tryCatch,
  mapResult,
  flatMapResult,
  mkErrClass,
  mapperFn,
  isErrorType,
} from "../src";

// Custom error types
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}
const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 0,
  url: "",
});
const ValidationError = mkErrClass("ValidationError", "VALIDATION_ERROR");
const FormatError = mkErrClass("FormatError", "FORMAT_ERROR");

// Instance types for clarity
type ApiErrorInstance = InstanceType<typeof ApiError>;
type ValidationErrorInstance = InstanceType<typeof ValidationError>;
type FormatErrorInstance = InstanceType<typeof FormatError>;

// Data types
interface User {
  id: number;
  name: string;
  email: string;
}

interface FormattedUser {
  displayName: string;
  initials: string;
  id: number;
}

// API function that might throw ApiError
const fetchUsers = asyncFn<ApiErrorInstance>()(async () => {
  const response = await fetch("https://api.example.com/users");

  if (!response.ok) {
    throw new ApiError("Failed to fetch users", {
      data: {
        status: response.status,
        url: "https://api.example.com/users",
      },
    });
  }

  return await response.json();
});

// Try executing the API call
async function run() {
  console.log("Fetching users...");
  const result = await tryCatch(fetchUsers);

  // 1. Create a mapper function that might throw ValidationError
  const validateUsers = mapperFn<ValidationErrorInstance>()(
    (users: unknown[]) => {
      if (!Array.isArray(users)) {
        throw new ValidationError("Expected users array");
      }

      return users.map((user) => {
        if (!user || typeof user !== "object" || !("name" in user)) {
          throw new ValidationError("User is missing name");
        }
        return user as User;
      });
    }
  );

  // 2. Map the result with our typed mapper function
  // - Type safety is automatic - no need to specify ValidationError as a type parameter
  // - Error types are tracked in the type system
  const validatedResult = await mapResult(result, validateUsers);

  // 3. Create a formatter mapper that returns a Result
  const formatUsers = mapperFn<FormatErrorInstance>()((users: User[]) => {
    if (users.length === 0) {
      throw new FormatError("Cannot format empty user list");
    }

    // Return a new Result from this mapper
    return tryCatch(
      asyncFn<ValidationErrorInstance>()(async (): Promise<FormattedUser[]> => {
        return users.map((user) => ({
          displayName: user.name.toUpperCase(),
          initials: user.name
            .split(" ")
            .map((n: string) => n[0])
            .join(""),
          id: user.id,
        }));
      })
    );
  });

  // 4. Transform the validated result with flatMapResult
  // - Again, no need to specify error types manually
  // - All three possible errors are tracked: ApiError, ValidationError, FormatError
  const formattedResult = await flatMapResult(validatedResult, formatUsers);

  // 5. Type-safe error handling with proper narrowing
  if (formattedResult.success) {
    console.log("Formatted users:", formattedResult.data);
  } else {
    // Type narrowing works perfectly with instanceof
    if (isErrorType(formattedResult.error.raw, ApiError)) {
      // Original API error
      console.error(
        `API Error (${formattedResult.error.raw.data.status}): ${formattedResult.error.message}`
      );
    } else if (isErrorType(formattedResult.error.raw, ValidationError)) {
      // Validation error from validateUsers
      console.error(`Validation Error: ${formattedResult.error.message}`);
    } else if (isErrorType(formattedResult.error.raw, FormatError)) {
      // Format error from formatUsers
      console.error(`Format Error: ${formattedResult.error.message}`);
    }
  }
}

// Execute the example
run().catch((err) => console.error("Unexpected error:", err));
