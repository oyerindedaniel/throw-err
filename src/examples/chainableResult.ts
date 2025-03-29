import { ChainableResult } from "../utils/chainableResult";
import { syncFn } from "../core/syncFn";
import { asyncFn } from "../core/asyncFn";
import { CommonErrorCodes } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";
import { ResultError } from "../types/Result";

// Custom error types using mkErrClass
const ParseError = mkErrClass("ParseError", CommonErrorCodes.VALIDATION);
const ValidationError = mkErrClass(
  "ValidationError",
  CommonErrorCodes.VALIDATION
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

  // Using the new trySync method for a cleaner chain
  return (
    ChainableResult.trySync(parseNumber, input)
      // Transform the value if successful
      .map((num) => num * 2)
      // Add validation
      .filter(
        (num) => num > 0,
        (num) => new ValidationError(`Value ${num} must be positive`)
      )
      // Map errors to a different type if needed
      .mapErr((err) => {
        if (err instanceof Error && err.name === "ParseError") {
          return new Error(`Invalid input: ${err.message}`);
        }
        return err;
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
      .map((str) => str.trim())
      .filter(
        (str) => str.length > 0,
        () => new ValidationError("Input cannot be empty")
      )
      // Apply side effects on success
      .tap((value) => {
        console.log(`Processing: ${value}`);
      })
      // Apply side effects on error
      .tapError((error) => {
        console.error(`Error: ${error.message}`);
      })
      // Convert to a standard Result type
      .toResult()
  );
}

// Example 3: Converting between standard and chainable Result types and using async
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchAndProcessData() {
  // Create a mock fetch function with proper error handling
  const fetchData = asyncFn<Error>()(() => {
    return Promise.resolve({ id: "123", name: "Example Data" });
  });

  // Using the new try method for async operations
  const result = await ChainableResult.tryAsync(fetchData);

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

// Example usage
console.log(parseAndValidateNumber("42")); // 84
console.log(parseAndValidateNumber("-10")); // 0 (fails validation)
console.log(parseAndValidateNumber("abc")); // 0 (fails parsing)

const validInput = processUserInput("  hello  ");
const emptyInput = processUserInput("   ");

console.log("Valid input result:", validInput);
console.log("Empty input result:", emptyInput);
