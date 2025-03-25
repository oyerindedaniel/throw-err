import { mkErrClass } from "../core/mkErrClass";
import {
  isErrorType,
  hasErrorName,
  hasProperty,
} from "../utils/errorTypeUtils";

describe("errorTypeUtils", () => {
  const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");

  describe("isErrorType", () => {
    test("identifies custom error types", () => {
      const error = new CustomError("test");
      expect(isErrorType(error, CustomError)).toBe(true);
    });

    test("rejects non-matching error types", () => {
      const error = new Error("test");
      expect(isErrorType(error, CustomError)).toBe(false);
    });

    test("rejects non-error values", () => {
      const testCases: unknown[] = ["string", 123, null, undefined, {}];
      testCases.forEach((value) => {
        // Type assertion needed because we're testing invalid inputs
        expect(isErrorType(value as unknown as Error, CustomError)).toBe(false);
      });
    });
  });

  describe("hasErrorName", () => {
    test("identifies errors with matching name", () => {
      const error = new CustomError("test");
      expect(hasErrorName(error, "CustomError")).toBe(true);
    });

    test("rejects errors with different name", () => {
      const error = new Error("test");
      expect(hasErrorName(error, "CustomError")).toBe(false);
    });

    test("rejects non-error values", () => {
      const testCases: unknown[] = ["string", 123, null, undefined, {}];
      testCases.forEach((value) => {
        // Type assertion needed because we're testing invalid inputs
        expect(hasErrorName(value as unknown as Error, "CustomError")).toBe(
          false
        );
      });
    });
  });

  describe("hasProperty", () => {
    test("identifies objects with property", () => {
      const error = new CustomError("test");
      expect(hasProperty(error, "code")).toBe(true);
    });

    test("rejects objects without property", () => {
      const error = new Error("test");
      expect(hasProperty(error, "code")).toBe(false);
    });

    test("handles null and undefined", () => {
      expect(hasProperty(null as unknown as object, "code")).toBe(false);
      expect(hasProperty(undefined as unknown as object, "code")).toBe(false);
    });

    test("handles primitive values", () => {
      const testCases: unknown[] = ["string", 123, true];
      testCases.forEach((value) => {
        expect(hasProperty(value as unknown as object, "code")).toBe(false);
      });
    });
  });
});
