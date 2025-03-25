import {
  normalizeError,
  normalizeTypedError,
  isResultError,
} from "../utils/normalizeError";
import { ResultError } from "../types/Result";
import { ErrorCode, CommonErrorCodes } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";

describe("normalizeError", () => {
  test("normalizes regular Error objects", () => {
    const error = new Error("Test error");
    const normalized = normalizeError(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Test error");
    expect(normalized.code).toBe(CommonErrorCodes.UNKNOWN);
  });

  test("normalizes custom error with code", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const error = new CustomError("Custom error");
    const normalized = normalizeError(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Custom error");
    expect(normalized.code).toBe("CUSTOM_ERROR");
  });

  test("normalizes string errors", () => {
    const normalized = normalizeError("String error");

    expect(normalized.raw).toBeInstanceOf(Error);
    expect(normalized.message).toBe("String error");
    expect(normalized.code).toBe(CommonErrorCodes.UNKNOWN);
  });

  test("normalizes non-string primitive errors", () => {
    const normalized = normalizeError(42);

    expect(normalized.raw).toBeInstanceOf(Error);
    expect(normalized.message).toBe("Unknown error: 42");
    expect(normalized.code).toBe(CommonErrorCodes.UNKNOWN);
  });

  test("normalizes object errors", () => {
    const errorObj = { message: "Object error" };
    const normalized = normalizeError(errorObj);

    expect(normalized.raw).toBeInstanceOf(Error);
    expect(normalized.message).toBe("Unknown error: [object Object]");
    expect(normalized.code).toBe(CommonErrorCodes.UNKNOWN);
  });

  test("preserves existing ResultError objects", () => {
    const originalError = new Error("Original error");
    const resultError: ResultError<Error> = {
      raw: originalError,
      message: "Result error",
      code: "RESULT_ERROR" as ErrorCode,
    };

    const normalized = normalizeError(resultError);

    expect(normalized).toBe(resultError);
    expect(normalized.raw).toBe(originalError);
    expect(normalized.message).toBe("Result error");
    expect(normalized.code).toBe("RESULT_ERROR");
  });

  test("normalizeTypedError preserves error type", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const error = new CustomError("Typed error");
    const normalized = normalizeTypedError(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Typed error");
    expect(normalized.code).toBe("CUSTOM_ERROR");
  });

  test("isResultError correctly identifies ResultError objects", () => {
    const error = new Error("Test error");
    const resultError: ResultError<Error> = {
      raw: error,
      message: "Result error",
      code: "TEST_ERROR" as ErrorCode,
    };

    expect(isResultError(resultError)).toBe(true);
    expect(isResultError(error)).toBe(false);
    expect(isResultError({})).toBe(false);
    expect(isResultError(null)).toBe(false);
    expect(isResultError(undefined)).toBe(false);
  });

  test("handles errors with name property but no code", () => {
    class NamedError extends Error {
      name = "NAMED_ERROR";
    }
    const error = new NamedError("Named error");
    const normalized = normalizeError(error);

    expect(normalized.raw).toBe(error);
    expect(normalized.message).toBe("Named error");
    expect(normalized.code).toBe("NAMED_ERROR");
  });
});
