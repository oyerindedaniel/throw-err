import { withCode } from "../core/withCode";
import { ErrorCode } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";

describe("withCode", () => {
  test("attaches error code to thrown errors", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    type CustomErrorType = InstanceType<typeof CustomError>;
    const wrappedFn = withCode<CustomErrorType>("FETCH_ERROR")(async () => {
      throw new CustomError("Failed to fetch");
    });

    const result = await wrappedFn.fn().catch((err) => err);

    expect(result).toBeInstanceOf(CustomError);
    expect(result.message).toBe("Failed to fetch");
    expect(result.code).toBe("FETCH_ERROR");
  });

  test("preserves existing error code if present", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    type CustomErrorType = InstanceType<typeof CustomError>;
    const error = new CustomError("Original error");
    error.code = "EXISTING_CODE" as ErrorCode;

    const wrappedFn = withCode<CustomErrorType>("NEW_CODE")(async () => {
      throw error;
    });

    const result = await wrappedFn.fn().catch((err) => err);

    expect(result).toBeInstanceOf(CustomError);
    expect(result.message).toBe("Original error");
    expect(result.code).toBe("NEW_CODE");
  });

  test("passes through successful results", async () => {
    const wrappedFn = withCode<Error>("FETCH_ERROR")(async () => {
      return "success";
    });

    const result = await wrappedFn.fn();

    expect(result).toBe("success");
  });

  test("handles non-Error thrown values", async () => {
    const wrappedFn = withCode<Error>("FETCH_ERROR")(async () => {
      throw "string error";
    });

    const result = await wrappedFn.fn().catch((err) => err);

    expect(result).toBe("string error");
  });

  test("preserves error type information", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    type CustomErrorType = InstanceType<typeof CustomError>;
    const wrappedFn = withCode<CustomErrorType>("FETCH_ERROR")(async () => {
      throw new CustomError("Failed to fetch");
    });

    const result = await wrappedFn.fn().catch((err) => err);

    expect(result).toBeInstanceOf(CustomError);
    expect(result.name).toBe("CustomError");
  });

  test("handles multiple arguments", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    type CustomErrorType = InstanceType<typeof CustomError>;
    const wrappedFn = withCode<CustomErrorType>("FETCH_ERROR")(
      async (url: string, options: { timeout: number }) => {
        throw new CustomError(
          `Failed to fetch ${url} with timeout ${options.timeout}`
        );
      }
    );

    const result = await wrappedFn
      .fn("https://example.com", { timeout: 5000 })
      .catch((err) => err);

    expect(result).toBeInstanceOf(CustomError);
    expect(result.message).toBe(
      "Failed to fetch https://example.com with timeout 5000"
    );
    expect(result.code).toBe("FETCH_ERROR");
  });
});
