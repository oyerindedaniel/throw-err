import {
  asyncFn,
  tryCatch,
  mkErrClass,
  withCode,
  mapResult,
  flatMapResult,
  catchErr,
  retry,
  timeout,
  compose,
  mapErr,
  TimeoutError,
  mapperFn,
} from "..";

// Custom error types
interface ApiErrorData extends Record<string, unknown> {
  status: number;
  url: string;
}

const ApiError = mkErrClass<ApiErrorData>("ApiError", "API_ERROR", {
  status: 0,
  url: "",
});
const NotFoundError = mkErrClass("NotFoundError", "NOT_FOUND");
const ValidationError = mkErrClass("ValidationError", "VALIDATION_ERROR");

// Define instance types for custom errors
type ApiErrorInstance = InstanceType<typeof ApiError>;
type NotFoundErrorInstance = InstanceType<typeof NotFoundError>;
type ValidationErrorInstance = InstanceType<typeof ValidationError>;

describe("throw-err basic functionality", () => {
  test("asyncFn and tryCatch handle success case", async () => {
    const successFn = asyncFn<Error>()(async (x: number) => x * 2);
    const result = await tryCatch(successFn, 5);

    expect(result.success).toBe(true);
    expect(result.data).toBe(10);
  });

  test("asyncFn and tryCatch handle error case", async () => {
    const errorFn = asyncFn<ApiErrorInstance>()(async () => {
      throw new ApiError("API request failed", {
        data: { status: 500, url: "https://api.example.com" },
      });
    });

    const result = await tryCatch(errorFn);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("API request failed");
      expect(result.error.code).toBe("API_ERROR");
      expect(result.error.raw.data.status).toBe(500);
      expect(result.error.raw.data.url).toBe("https://api.example.com");
    }
  });

  test("withCode attaches error code", async () => {
    const fn = withCode<Error>("CUSTOM_CODE")(async () => {
      throw new Error("Something went wrong");
    });

    const result = await tryCatch(fn);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("CUSTOM_CODE");
    }
  });

  test("mapResult transforms success value", async () => {
    const successFn = asyncFn<Error>()(async () => ({ id: 1, name: "John" }));
    const result = await tryCatch(successFn);

    const nameMapper = mapperFn<Error>()(
      (user: { id: number; name: string }) => user.name
    );
    const mapped = await mapResult(result, nameMapper);

    expect(mapped.success).toBe(true);
    if (mapped.success) {
      expect(mapped.data).toBe("John");
    }
  });

  test("flatMapResult chains operations", async () => {
    const getUserFn = asyncFn<ApiErrorInstance>()(async (id: number) => ({
      id,
      name: "John",
    }));
    const getUserPostsFn = asyncFn<NotFoundErrorInstance>()(
      async (user: { id: number }) => {
        if (user.id !== 1) {
          throw new NotFoundError("Posts not found");
        }
        return ["Post 1", "Post 2"];
      }
    );

    const result = await tryCatch(getUserFn, 1);

    const postMapper = mapperFn<NotFoundErrorInstance>()(
      (user: { id: number; name: string }) => tryCatch(getUserPostsFn, user)
    );

    const chainedResult = await flatMapResult(result, postMapper);

    expect(chainedResult.success).toBe(true);
    if (chainedResult.success) {
      expect(chainedResult.data).toEqual(["Post 1", "Post 2"]);
    }
  });

  test("catchErr recovers from errors with potential type change", async () => {
    // Function that returns a complex user object but might fail
    const getUserFn = asyncFn<NotFoundErrorInstance>()(async (id: string) => {
      if (id === "missing") {
        throw new NotFoundError("User not found");
      }
      return {
        id,
        name: "John Smith",
        email: "john@example.com",
        roles: ["user", "admin"],
        lastLogin: new Date(),
      };
    });

    // 1. Recovery with same type
    const result1 = await tryCatch(getUserFn, "missing");
    const recovered1 = await catchErr(result1, () => {
      return {
        success: true,
        data: {
          id: "guest",
          name: "Guest User",
          email: "guest@example.com",
          roles: ["guest"],
          lastLogin: new Date(),
        },
      };
    });

    expect(recovered1.success).toBe(true);
    if (recovered1.success) {
      expect(recovered1.data.id).toBe("guest");
      expect(recovered1.data.roles).toContain("guest");
    }

    // 2. Recovery with simpler type
    interface BasicUserInfo {
      name: string;
      isGuest: boolean;
    }

    const result2 = await tryCatch(getUserFn, "missing");
    const recovered2 = await catchErr<
      {
        id: string;
        name: string;
        email: string;
        roles: string[];
        lastLogin: Date;
      },
      BasicUserInfo,
      NotFoundErrorInstance,
      Error
    >(result2, () => {
      return {
        success: true,
        data: {
          name: "Anonymous",
          isGuest: true,
        },
      };
    });

    expect(recovered2.success).toBe(true);
    if (recovered2.success) {
      // The type could be either the original user object or the basic info
      if ("isGuest" in recovered2.data) {
        // It's the BasicUserInfo
        expect(recovered2.data.isGuest).toBe(true);
        expect(recovered2.data.name).toBe("Anonymous");
      } else {
        // It's the full user object
        expect(recovered2.data.id).toBeDefined();
      }
    }
  });

  test("mapErr transforms errors", async () => {
    const errorFn = asyncFn<ApiErrorInstance>()(async () => {
      throw new ApiError("API error", {
        data: { status: 404, url: "https://api.example.com" },
      });
    });

    const result = await tryCatch(errorFn);
    const transformed = mapErr(result, (apiError) => {
      return new ValidationError(`Invalid request: ${apiError.message}`);
    });

    expect(transformed.success).toBe(false);
    if (!transformed.success) {
      expect(transformed.error.raw).toBeInstanceOf(ValidationError);
      expect(transformed.error.message).toBe("Invalid request: API error");
      expect(transformed.error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("compose combines two functions", async () => {
    const getUserFn = asyncFn<ApiErrorInstance>()(async (id: number) => ({
      id,
      name: "John",
    }));

    // Fix the function to properly handle input from the first function
    const getUserAgeFn = (user: { id: number }) =>
      asyncFn<ValidationErrorInstance>()(async () => {
        return user.id * 10; // mock age calculation
      });

    const getUserAge = compose(getUserFn, getUserAgeFn);

    const result = await tryCatch(getUserAge, 3);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(30);
    }
  });

  // We'll mock the actual timeout behavior for the test
  test("timeout adds a timeout", async () => {
    jest.useFakeTimers();

    const slowFn = asyncFn<Error>()(async () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve("Done"), 10000);
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

  // Testing retry with a mock function
  test("retry retries a function", async () => {
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

  test("catchErr can transform errors to different error types", async () => {
    // Original error type
    const networkErrorFn = asyncFn<ApiErrorInstance>()(async () => {
      throw new ApiError("Network failure", {
        data: { status: 503, url: "/api/users" },
      });
    });

    // Create a more specific application error type
    const SystemError = mkErrClass("SystemError", "SYSTEM_ERROR");
    type SystemErrorInstance = InstanceType<typeof SystemError>;

    // Transform API error to system error
    const result = await tryCatch(networkErrorFn);
    const transformedResult = await catchErr<
      unknown, // original success type (doesn't matter for this test)
      never, // no recovery data type since we're not recovering
      ApiErrorInstance,
      SystemErrorInstance
    >(result, (apiError) => ({
      success: false,
      error: {
        raw: new SystemError(`System error: ${apiError.message}`),
        message: `A system error occurred: ${apiError.message}`,
        code: "SYSTEM_ERROR",
      },
    }));

    // Verify error was transformed but still an error
    expect(transformedResult.success).toBe(false);
    if (!transformedResult.success) {
      expect(transformedResult.error.raw).toBeInstanceOf(SystemError);
      expect(transformedResult.error.raw.name).toBe("SystemError");
      expect(transformedResult.error.code).toBe("SYSTEM_ERROR");
      expect(transformedResult.error.message).toContain(
        "A system error occurred"
      );
    }
  });

  test("mapResult handles errors thrown by the mapper", async () => {
    // Create a function that returns a valid result
    const successFn = asyncFn<Error>()(async () => "original data");
    const result = await tryCatch(successFn);

    // Mapper that will throw a custom error
    const MapperError = mkErrClass("MapperError", "MAPPER_ERROR");
    type MapperErrorInstance = InstanceType<typeof MapperError>;

    const errorMapper = mapperFn<MapperErrorInstance>()(() => {
      throw new MapperError("Error in the mapper");
    });

    const mapped = await mapResult(result, errorMapper);

    // Verify the result contains the mapper's error
    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBeInstanceOf(MapperError);
      expect(mapped.error.code).toBe("MAPPER_ERROR");
      expect(mapped.error.message).toBe("Error in the mapper");
    }
  });

  test("flatMapResult handles errors thrown by the mapper", async () => {
    const successFn = asyncFn<Error>()(async () => "original data");
    const result = await tryCatch(successFn);

    const FlatMapperError = mkErrClass("FlatMapperError", "FLATMAPPER_ERROR");
    type FlatMapperErrorInstance = InstanceType<typeof FlatMapperError>;

    const errorMapper = mapperFn<FlatMapperErrorInstance>()(() => {
      throw new FlatMapperError("Error in the flat mapper");
    });

    const mapped = await flatMapResult(result, errorMapper);

    // Verify the result captures the mapper's error
    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBeInstanceOf(FlatMapperError);
      expect(mapped.error.code).toBe("FLATMAPPER_ERROR");
      expect(mapped.error.message).toBe("Error in the flat mapper");
    }
  });

  test("mapResult works with the new MapperFn approach", async () => {
    const successFn = asyncFn<Error>()(async () => "original data");
    const result = await tryCatch(successFn);

    const FormatError = mkErrClass("FormatError", "FORMAT_ERROR");
    type FormatErrorInstance = InstanceType<typeof FormatError>;

    const formatter = mapperFn<FormatErrorInstance>()((data: string) => {
      if (data.length < 15) {
        throw new FormatError("Data too short for formatting");
      }
      return data.toUpperCase();
    });

    const mapped = await mapResult(result, formatter);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBeInstanceOf(FormatError);
      expect(mapped.error.code).toBe("FORMAT_ERROR");
      expect(mapped.error.message).toBe("Data too short for formatting");
    }
  });

  test("flatMapResult works with the new MapperFn approach", async () => {
    const successFn = asyncFn<Error>()(async () => "original data");
    const result = await tryCatch(successFn);

    const ProcessError = mkErrClass("ProcessError", "PROCESS_ERROR");
    type ProcessErrorInstance = InstanceType<typeof ProcessError>;

    const NestedError = mkErrClass("NestedError", "NESTED_ERROR");
    type NestedErrorInstance = InstanceType<typeof NestedError>;

    const processor = mapperFn<ProcessErrorInstance>()((data: string) => {
      if (!data) {
        throw new ProcessError("Empty data cannot be processed");
      }

      // Simulate a nested operation that returns a Result<number, NestedError>
      const nestedFn = asyncFn<NestedErrorInstance>()(async (str: string) => {
        if (str.length < 15) {
          throw new NestedError("Data too short");
        }
        return str.length;
      });

      // Return the nested Result
      return tryCatch(nestedFn, data);
    });

    // Use flatMapResult with the typed mapper
    const mapped = await flatMapResult(result, processor);

    // Verify the result captures the nested operation's error
    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBeInstanceOf(NestedError);
      expect(mapped.error.code).toBe("NESTED_ERROR");
      expect(mapped.error.message).toBe("Data too short");
    }

    // Test with data that will trigger the mapper's own error
    const emptyResult = await tryCatch(asyncFn<Error>()(async () => ""));
    const emptyMapped = await flatMapResult(emptyResult, processor);

    // Verify it correctly captures the mapper's error
    expect(emptyMapped.success).toBe(false);
    if (!emptyMapped.success) {
      expect(emptyMapped.error.raw).toBeInstanceOf(ProcessError);
      expect(emptyMapped.error.code).toBe("PROCESS_ERROR");
      expect(emptyMapped.error.message).toBe("Empty data cannot be processed");
    }
  });
});
