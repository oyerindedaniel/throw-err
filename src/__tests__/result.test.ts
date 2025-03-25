import { Result, ResultError } from "../types/Result";
import { ErrorCode } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";

describe("Result", () => {
  const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
  type CustomErrorType = InstanceType<typeof CustomError>;

  describe("success", () => {
    test("creates success result", () => {
      const data = { id: 1, name: "Test" };
      const result = Result.success(data);

      expect(result.success).toBe(true);
      expect(result.data).toBe(data);
      expect(result.error).toBeUndefined();
    });
  });

  describe("failure", () => {
    test("creates failure result", () => {
      const error: ResultError<CustomErrorType> = {
        message: "Test error",
        raw: new CustomError("Test error"),
        code: "CUSTOM_ERROR" as ErrorCode,
      };

      const result = Result.failure(error);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.data).toBeUndefined();
    });
  });

  describe("unwrap", () => {
    test("returns data for success result", () => {
      const data = { id: 1, name: "Test" };
      const result = Result.success(data);

      const unwrapped = Result.unwrap(result);
      expect(unwrapped).toBe(data);
    });

    test("throws for failure result", () => {
      const error: ResultError<CustomErrorType> = {
        message: "Test error",
        raw: new CustomError("Test error"),
        code: "CUSTOM_ERROR" as ErrorCode,
      };

      const result = Result.failure(error);

      expect(() => Result.unwrap(result)).toThrow(error.raw);
    });
  });

  describe("map", () => {
    test("transforms success result data", () => {
      const data = { id: 1, name: "Test" };
      const result = Result.success(data);

      const mapped = Result.map(result, (user) => user.name);

      expect(mapped.success).toBe(true);
      expect(mapped.data).toBe("Test");
    });

    test("passes through failure result", () => {
      const error: ResultError<CustomErrorType> = {
        message: "Test error",
        raw: new CustomError("Test error"),
        code: "CUSTOM_ERROR" as ErrorCode,
      };

      const result = Result.failure(error);

      const mapped = Result.map(result, (data) => `${data}-mapped`);

      expect(mapped.success).toBe(false);
      expect(mapped.error).toBe(error);
    });
  });
});
