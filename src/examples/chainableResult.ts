import { ChainableResult } from "../utils/chainableResult";
import { syncFn } from "../core/syncFn";
import { asyncFn } from "../core/asyncFn";
import { CommonErrorCodes } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";
import { ResultError, Result } from "../types/Result";
import { mapperFn } from "../utils/mapperFn";

// Define a custom error type
type NetworkErrorData = {
  retryable: boolean;
  statusCode: number;
};

type ProcessingErrorData = {
  step: string;
};

// Custom error types using mkErrClass
const ParseError = mkErrClass("ParseError", CommonErrorCodes.VALIDATION);
const ValidationError = mkErrClass(
  "ValidationError",
  CommonErrorCodes.VALIDATION
);
const NetworkError = mkErrClass<NetworkErrorData, "NetworkError">(
  "NetworkError",
  CommonErrorCodes.NETWORK,
  {
    retryable: false,
    statusCode: 0,
  }
);
const ProcessingError = mkErrClass<ProcessingErrorData, "ProcessingError">(
  "ProcessingError",
  "PROCESSING_ERROR",
  {
    step: "",
  }
);

// Example 1: Basic method chaining with parsing and validation
function parseAndValidateNumber(input: string): number {
  // Create a wrapped synchronous function
  const parseNumber = syncFn<InstanceType<typeof ParseError>>()(
    (input: string): number => {
      const num = Number(input);
      if (isNaN(num))
        throw new ParseError(`Cannot parse "${input}" as a number`);
      return num;
    }
  );

  // Using the new tryCatch method for a cleaner chain
  return (
    ChainableResult.tryCatch(parseNumber, input)
      // Transform the value if successful
      .map((num) => num * 2)
      // Add validation
      .filter(
        (num) => num > 0,
        (num) => new ValidationError(`Value ${num} must be positive`)
      )
      // Map errors to a different type if needed
      .mapErr((error) => {
        if (error.name === "ParseError") {
          return new Error(`Invalid input: ${error.message}`);
        }
        return error;
      })
      // Extract the value or provide a default
      .getOrElse(0)
  );
}

// Example 2: Recovery and side effects
function processUserInput(input: string) {
  return (
    ChainableResult.success(input)
      // Apply transformations
      .map((str: string) => str.trim())
      .filter(
        (str: string) => str.length > 0,
        () => new ValidationError("Input cannot be empty")
      )
      // Apply side effects on success
      .tap((value: string) => {
        console.log(`Processing: ${value}`);
      })
      // Apply side effects on error
      .tapError((error: ResultError<Error>) => {
        console.error(`Error: ${error.message}`);
      })
      // Convert to a standard Result type
      .toResult()
  );
}

// Example 3: Converting between standard and chainable Result types and using async
async function fetchAndProcessData() {
  // Create a mock fetch function with proper error handling
  const fetchData = asyncFn<Error>()(() => {
    return Promise.resolve({ id: "123", name: "Example Data" });
  });

  // Using the tryCatchAsync method for async operations
  const result = await ChainableResult.tryCatchAsync(fetchData);

  // Now we can use the chainable methods on the result
  return (
    result
      .map((data: { id: string; name: string }) => {
        // Process the data
        return {
          ...data,
          processedAt: new Date(),
        };
      })
      .recoverWithResult((error: ResultError<Error>) => {
        // Handle network errors with a fallback
        if (error.code === CommonErrorCodes.NETWORK) {
          return ChainableResult.success({
            offline: true,
            message: "Using offline data",
          });
        }
        // Re-throw other errors
        return ChainableResult.failure(error);
      })
      // Convert back to a standard Result
      .toResult()
  );
}

// Example 4: Using transformBoth and combineAll
function transformAndCombineResults() {
  // Create some test results
  const result1 = ChainableResult.success(10);
  const result2 = ChainableResult.success(20);
  const error = new ValidationError("Invalid value");
  const result3 = ChainableResult.fromError(error);

  // Transform both success and error values
  const transformed = ChainableResult.transformBoth(
    result1.toResult(),
    (num) => `Number: ${num}`,
    (error: Error) => new ProcessingError(`Transformed: ${error.message}`)
  );

  console.log("Transformed result:", transformed);

  // Combine multiple results - fails fast if any are failures
  const combinedSuccess = ChainableResult.combine(result1, result2);
  const combinedWithFailure = ChainableResult.combine(result1, result3);

  console.log("Combined success:", combinedSuccess);
  console.log("Combined with failure:", combinedWithFailure);

  // Combine multiple results into an array
  const results = [result1, result2];
  const combinedAll = result1.combineAll(results);

  console.log("Combined all:", combinedAll);

  return { transformed, combinedSuccess, combinedWithFailure, combinedAll };
}

// Example 5: MapperFn with advanced error typing
async function usingMapperFunctions() {
  // Create typed mappers
  const validateNumber = mapperFn<InstanceType<typeof ValidationError>>()(
    (num: number) => {
      if (num <= 0) {
        throw new ValidationError("Number must be positive");
      }
      return num * 2;
    }
  );

  const processData = mapperFn<InstanceType<typeof ProcessingError>>()(
    (data: { value: number }) => {
      try {
        return {
          result: data.value * 10,
          processed: true,
        };
      } catch (err) {
        const error = new ProcessingError("Failed to process data");
        error.data.step = "multiplication";
        throw error;
      }
    }
  );

  // Create a test result
  const result = ChainableResult.success(5);
  const negativeResult = ChainableResult.success(-5);

  // Use mapWithMapper for type-safe error handling
  const mappedResult = await result.mapWithMapper(validateNumber);
  const failedMapping = await negativeResult.mapWithMapper(validateNumber);

  console.log("Mapped with mapper (success):", mappedResult);
  console.log("Mapped with mapper (failure):", failedMapping);

  // Create data result
  const dataResult = ChainableResult.success({ value: 10 });

  // Create a properly typed mapper for the flat map operation
  const flatMapperFn = mapperFn<InstanceType<typeof ProcessingError>>()(
    (data: { value: number }) => {
      if (data.value > 0) {
        const processed = processData.fn(data);
        return Result.success(processed);
      } else {
        return Result.failure({
          raw: new ProcessingError("Cannot process non-positive values"),
          message: "Cannot process non-positive values",
          code: "PROCESSING_ERROR",
        });
      }
    }
  );

  const flatMapped = await dataResult.flatMapWithMapper(flatMapperFn);

  console.log("Flat mapped result:", flatMapped);

  return { mappedResult, failedMapping, flatMapped };
}

// Example 6: Async operations with proper chaining
async function asyncOperationsExample() {
  // Create an async function that may fail
  type UserData = {
    id: string;
    name: string;
    email: string | null;
  };

  const fetchUser = async (id: string): Promise<UserData> => {
    // Simulate network request
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (id === "error") {
      const error = new NetworkError("Failed to fetch user data");
      error.data.statusCode = 404;
      error.data.retryable = false;
      throw error;
    }

    return { id, name: `User ${id}`, email: `user${id}@example.com` };
  };

  // Wrap the fetchUser function with asyncFn
  const fetchUserWrapped =
    asyncFn<InstanceType<typeof NetworkError>>()(fetchUser);

  // Create a promise by calling the function directly
  const successPromise = fetchUserWrapped.fn("123");
  const errorPromise = fetchUserWrapped.fn("error");

  // Convert promises to chainable results
  const successResult = await ChainableResult.fromPromise<
    UserData,
    InstanceType<typeof NetworkError>
  >(successPromise);
  const errorResult = await ChainableResult.fromPromise<
    UserData,
    InstanceType<typeof NetworkError>
  >(errorPromise);

  // Map async example with proper typing
  const mappedAsync = await successResult.mapAsync(async (user: UserData) => {
    // Simulate fetching additional data
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      lastLogin: new Date(),
      active: true,
    };
  });

  // FlatMap async example with proper typing
  const flatMappedAsync = await successResult.flatMapAsync(
    async (user: UserData) => {
      // Simulate fetching posts
      await new Promise((resolve) => setTimeout(resolve, 50));

      return ChainableResult.success({
        user,
        posts: [
          { id: "p1", title: "First post" },
          { id: "p2", title: "Second post" },
        ],
      });
    }
  );

  // Recover from errors with async operation
  const recovered = await errorResult.recoverWithResult((error) => {
    if (
      error.raw instanceof NetworkError &&
      error.raw.data.statusCode === 404
    ) {
      return ChainableResult.success<UserData>({
        id: "unknown",
        name: "Guest User",
        email: null,
      });
    }
    return ChainableResult.failure(error);
  });

  console.log("Async success result:", successResult);
  console.log("Async error result:", errorResult);
  console.log("Mapped async:", mappedAsync);
  console.log("Flat mapped async:", flatMappedAsync);
  console.log("Recovered async:", recovered);

  return {
    successResult,
    errorResult,
    mappedAsync,
    flatMappedAsync,
    recovered,
  };
}

// Run all examples
console.log("Example 1 results:");
console.log(parseAndValidateNumber("42")); // 84
console.log(parseAndValidateNumber("-10")); // 0 (fails validation)
console.log(parseAndValidateNumber("abc")); // 0 (fails parsing)

console.log("\nExample 2 results:");
const validInput = processUserInput("  hello  ");
const emptyInput = processUserInput("   ");
console.log("Valid input result:", validInput);
console.log("Empty input result:", emptyInput);

console.log("\nExample 3 results:");
fetchAndProcessData().then((result) => {
  console.log("Fetch and process result:", result);
});

console.log("\nExample 4 results:");
transformAndCombineResults();

console.log("\nExample 5 results:");
usingMapperFunctions().then(() => {
  console.log("Mapper functions example complete");
});

console.log("\nExample 6 results:");
asyncOperationsExample().then(() => {
  console.log("Async operations example complete");
});
