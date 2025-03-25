import { tryCatch } from "../core/tryCatch";
import { asyncFn } from "../core/asyncFn";
import { mkErrClass } from "../core/mkErrClass";

describe("tryCatch", () => {
  test("tryCatch returns success result for successful function", async () => {
    const fn = asyncFn<Error>()(async (x: number) => x * 2);

    const result = await tryCatch(fn, 5);

    expect(result.success).toBe(true);
    expect(result.data).toBe(10);
    expect(result.error).toBeUndefined();
  });

  test("tryCatch returns failure result for throwing function", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const fn = asyncFn<InstanceType<typeof CustomError>>()(async () => {
      throw new CustomError("Something went wrong");
    });

    const result = await tryCatch(fn);

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    if (!result.success) {
      expect(result.error.raw).toBeInstanceOf(CustomError);
      expect(result.error.message).toBe("Something went wrong");
      expect(result.error.code).toBe("CUSTOM_ERROR");
    }
  });

  test("tryCatch handles functions with multiple arguments", async () => {
    const fn = asyncFn<Error>()(async (a: number, b: number, c: string) => {
      return `${a + b} ${c}`;
    });

    const result = await tryCatch(fn, 3, 4, "items");

    expect(result.success).toBe(true);
    expect(result.data).toBe("7 items");
  });

  test("tryCatch handles errors without code", async () => {
    const fn = asyncFn<Error>()(async () => {
      throw new Error("Generic error");
    });

    const result = await tryCatch(fn);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.raw).toBeInstanceOf(Error);
      expect(result.error.message).toBe("Generic error");
      expect(result.error.code).toBe("UNKNOWN_ERROR");
    }
  });
});
