import {
  asyncFn,
  tryCatchAsync,
  mkErrClass,
  normalizeError,
  normalizeTypedError,
  isResultError,
} from "..";

// Create custom error types
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

const ApiError = mkErrClass<ApiErrorData, "ApiError">("ApiError", "API_ERROR", {
  status: 0,
  url: "",
});

// Mock API function that might throw different types of errors
async function fetchData(id: string) {
  if (id === "404") {
    throw new ApiError("Resource not found", {
      data: { status: 404, url: `/api/data/${id}` },
    });
  }
  if (id === "fail") {
    throw "Something failed"; // Non-Error throw
  }
  if (id === "error") {
    throw new Error("Generic error");
  }
  return { id, name: "Sample data" };
}

// Function to demonstrate handling different error types
async function demonstrateNormalization() {
  console.log("========== Error Normalization Example ==========");

  try {
    // Example 1: Normalizing standard Error
    console.log("\n1. Normalizing a standard Error:");
    const stdError = new Error("Standard error");
    const normalizedStd = normalizeError(stdError);
    console.log("Original:", stdError);
    console.log("Normalized:", normalizedStd);

    // Example 2: Normalizing custom error
    console.log("\n2. Normalizing a custom error:");
    const customError = new ApiError("API error occurred", {
      data: {
        status: 404,
        url: "/api/resource",
      },
    });
    const normalizedCustom = normalizeTypedError(customError);
    console.log("Original type:", customError.constructor.name);
    console.log("Normalized:", {
      message: normalizedCustom.message,
      code: normalizedCustom.code,
      data: normalizedCustom.raw.data,
    });

    // Example 3: Handling non-Error values
    console.log("\n3. Normalizing a non-Error value:");
    const nonError = "Something went wrong";
    const normalizedNon = normalizeError(nonError);
    console.log("Original:", nonError);
    console.log("Normalized:", {
      message: normalizedNon.message,
      code: normalizedNon.code,
    });

    // Example 4: Using with existing async functions
    console.log("\n4. Using with async functions and try/catch:");

    // Wrapping a function that might throw various errors
    const wrappedFetch = asyncFn<Error>()(async (id: string) => {
      try {
        return await fetchData(id);
      } catch (err) {
        // Use normalizeError to handle any type of error consistently
        const normalized = normalizeError(err);
        console.log("Caught and normalized error:", {
          message: normalized.message,
          code: normalized.code,
        });
        throw normalized.raw; // Re-throw the raw error
      }
    });

    // Try with different IDs to see different error types
    const ids = ["success", "404", "fail", "error"];

    for (const id of ids) {
      console.log(`\nAttempting to fetch data with ID: ${id}`);
      const result = await tryCatchAsync(wrappedFetch, id);

      if (result.success) {
        console.log("✅ Success:", result.data);
      } else {
        console.log("❌ Error:", result.error.message);
        console.log("   Type:", result.error.raw.constructor.name);

        // Check if it's an ApiError with data
        if (result.error.raw instanceof ApiError) {
          console.log("   Status:", result.error.raw.data.status);
          console.log("   URL:", result.error.raw.data.url);
        }
      }
    }

    // Example 5: Checking for ResultError
    console.log("\n5. Using isResultError helper:");
    const validResult = await tryCatchAsync(wrappedFetch, "error");
    console.log("Is validResult a ResultError?", isResultError(validResult));
    console.log(
      "Is validResult.error a ResultError?",
      isResultError(validResult.success ? null : validResult.error)
    );
    console.log(
      "Is raw error a ResultError?",
      isResultError(validResult.success ? null : validResult.error.raw)
    );
  } catch (err) {
    console.error("Unexpected error in example:", err);
  }
}

// Run the example
demonstrateNormalization().then(() => console.log("\nExample completed."));
