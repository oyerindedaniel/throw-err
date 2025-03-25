import {
  asyncFn,
  tryCatch,
  mkErrClass,
  withCode,
  mapResult,
  flatMapResult,
  retry,
  timeout,
  composeFns,
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
    const addTwo = asyncFn<Error>()(async (x: number) => x + 2);
    const multiplyByThree = (x: number) => asyncFn<Error>()(async () => x * 3);

    const addThenMultiply = composeFns(addTwo, multiplyByThree);
    const result = await tryCatch(addThenMultiply, 4);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(18); // (4 + 2) * 3
    }
  });

  test("retry succeeds after temporary failures", async () => {
    let attempts = 0;
    const flakeyFn = asyncFn<Error>()(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error("Temporary failure");
      }
      return "success";
    });

    const result = await retry(flakeyFn, 3);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("success");
    }
    expect(attempts).toBe(3);
  });

  test("timeout throws if function takes too long", async () => {
    const slowFn = asyncFn<Error>()(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "completed";
    });

    const result = await timeout(slowFn, 50);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.raw).toBeInstanceOf(TimeoutError);
    }
  });
});
