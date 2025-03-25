import { normalizeError, isResultError, mkErrClass } from "..";
import { ResultError } from "../types/Result";

describe("normalizeError utilities", () => {
  test("normalizeError handles standard Error objects", () => {
    const error = new Error("Test error");
    const normalized = normalizeError<Error>(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Test error");
    expect(normalized.code).toBe("Error");
  });

  test("normalizeError handles custom errors with code", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const error = new CustomError("Custom error");
    const normalized = normalizeError(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Custom error");
    expect(normalized.code).toBe("CUSTOM_ERROR");
  });

  test("normalizeError handles ResultError objects without double-wrapping", () => {
    const originalError = new Error("Original error");
    // Explicitly type the resultError
    const resultError = {
      raw: originalError,
      message: "Result error message",
      code: "RESULT_ERROR",
    } as ResultError<Error>;

    const normalized = normalizeError(resultError);

    expect(normalized).toBe(resultError); // Should be the same object reference
    expect(normalized.raw).toBe(originalError);
    expect(normalized.message).toBe("Result error message");
    expect(normalized.code).toBe("RESULT_ERROR");
  });

  test("normalizeError handles non-Error values", () => {
    const stringError = normalizeError("String error");
    expect(stringError.message).toBe("String error");
    expect(stringError.raw).toBeInstanceOf(Error);

    const objectError = normalizeError({ foo: "bar" });
    expect(objectError.message).toContain("Unknown error");
    expect(objectError.raw).toBeInstanceOf(Error);

    const nullError = normalizeError(null);
    expect(nullError.message).toContain("Unknown error: null");
    expect(nullError.raw).toBeInstanceOf(Error);
  });

  test("isResultError correctly identifies ResultError objects", () => {
    const error = new Error("Test");
    const resultError = {
      raw: error,
      message: "Test message",
      code: "TEST_CODE",
    };
    const notResultError = { message: "Not a result error" };

    expect(isResultError(resultError)).toBe(true);
    expect(isResultError(notResultError)).toBe(false);
    expect(isResultError(error)).toBe(false);
    expect(isResultError(null)).toBe(false);
    expect(isResultError(undefined)).toBe(false);
    expect(isResultError("string")).toBe(false);
  });
});
