import { compose, composeFns } from "../core/compose";
import { asyncFn } from "../core/asyncFn";
import { mkErrClass } from "../core/mkErrClass";
import { tryCatch } from "../core/tryCatch";
import { AsyncFnWithErr } from "../core/AsyncFnWithErr";

describe("compose wrapper functions", () => {
  const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
  const OtherError = mkErrClass("OtherError", "OTHER_ERROR");
  type CustomErrorType = InstanceType<typeof CustomError>;
  type OtherErrorType = InstanceType<typeof OtherError>;

  test("composes wrapper functions with error type accumulation", async () => {
    // Create a base function
    const baseFunction = new AsyncFnWithErr<
      number,
      CustomErrorType,
      readonly [number]
    >(async (n: number) => n * 2);

    // Create a wrapper that adds 10
    const addTenWrapper = <T extends number, E extends Error>(
      fn: AsyncFnWithErr<T, E, readonly [number]>
    ): AsyncFnWithErr<T, E, readonly [number]> => {
      return new AsyncFnWithErr<T, E, readonly [number]>(async (n: number) => {
        const result = await fn.fn(n);
        return (result + 10) as T;
      });
    };

    // Create a wrapper that might throw OtherError
    const validatePositiveWrapper = <T extends number, E extends Error>(
      fn: AsyncFnWithErr<T, E, readonly [number]>
    ): AsyncFnWithErr<T, E | OtherErrorType, readonly [number]> => {
      return new AsyncFnWithErr<T, E | OtherErrorType, readonly [number]>(
        async (n: number) => {
          if (n < 0) throw new OtherError("Negative numbers not allowed");
          return fn.fn(n);
        }
      );
    };

    // Compose the wrappers using the new compose function
    const composed = compose<
      number,
      CustomErrorType,
      readonly [number],
      never,
      OtherErrorType
    >(
      addTenWrapper,
      validatePositiveWrapper
    )(baseFunction);

    // Test successful case
    const result = await composed.fn(5);
    expect(result).toBe(20); // (5 * 2) + 10 = 20

    // Test error case
    try {
      await composed.fn(-5);
      fail("Should have thrown OtherError");
    } catch (error) {
      expect(error).toBeInstanceOf(OtherError);
    }
  });
});

describe("composeFns direct function composition", () => {
  const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
  const OtherError = mkErrClass("OtherError", "OTHER_ERROR");
  type CustomErrorType = InstanceType<typeof CustomError>;
  type OtherErrorType = InstanceType<typeof OtherError>;

  test("composes two functions successfully", async () => {
    const fn1 = asyncFn<CustomErrorType>()(async (x: number) => x + 10);
    const fn2 = (x: number) => asyncFn<OtherErrorType>()(async () => x * 2);

    const composed = composeFns(fn1, fn2);
    const result = await composed.fn(5);

    expect(result).toBe(30); // (5 + 10) * 2
  });

  test("handles errors from first function", async () => {
    const fn1 = asyncFn<CustomErrorType>()(async () => {
      throw new CustomError("First function error");
    });
    const fn2 = (x: number) => asyncFn<OtherErrorType>()(async () => x * 2);

    const composed = composeFns(fn1, fn2);
    const result = await tryCatch(composed);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.raw).toBeInstanceOf(CustomError);
    expect(result.error.raw.message).toBe("First function error");
  });

  test("handles errors from second function", async () => {
    const fn1 = asyncFn<CustomErrorType>()(async () => 42);
    const fn2 = () =>
      asyncFn<OtherErrorType>()(async () => {
        throw new OtherError("Second function error");
      });

    const composed = composeFns(fn1, fn2);
    const result = await tryCatch(composed);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected failure");
    expect(result.error.raw).toBeInstanceOf(OtherError);
    expect(result.error.raw.message).toBe("Second function error");
  });

  test("preserves type information through composition", async () => {
    const fn1 = asyncFn<CustomErrorType>()(async (input: string) =>
      parseInt(input, 10)
    );
    const fn2 = (x: number) =>
      asyncFn<OtherErrorType>()(async () => `processed ${x}`);

    const composed = composeFns(fn1, fn2);
    const result = await composed.fn("42");

    expect(result).toBe("processed 42");
  });

  test("composes two functions correctly with AsyncFnWithErr", async () => {
    // First function: takes a string and returns its length
    const fn1 = new AsyncFnWithErr<number, CustomErrorType, readonly [string]>(
      async (s: string) => {
        if (s === "") throw new CustomError("Empty string not allowed");
        return s.length;
      }
    );

    // Second function: takes a number and returns its square
    const fn2 = (n: number) =>
      new AsyncFnWithErr<number, OtherErrorType, readonly []>(async () => {
        if (n < 0) throw new OtherError("Negative numbers not allowed");
        return n * n;
      });

    // Compose the functions
    const composed = composeFns(fn1, fn2);

    // Test happy path
    const result = await composed.fn("hello");
    expect(result).toBe(25); // "hello" has length 5, 5² = 25

    // Test error from first function
    try {
      await composed.fn("");
      fail("Should have thrown CustomError");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
    }

    // Test error from second function (would require a negative length, which isn't possible
    // with strings, so we'll use a mock to force this case)
    const mockFn1 = new AsyncFnWithErr<
      number,
      CustomErrorType,
      readonly [string]
    >(
      async () => -1 // Return a negative number to trigger error in fn2
    );

    const composedWithMock = composeFns(mockFn1, fn2);

    try {
      await composedWithMock.fn("any");
      fail("Should have thrown OtherError");
    } catch (error) {
      expect(error).toBeInstanceOf(OtherError);
    }
  });

  test("propagates errors properly", async () => {
    // Create functions with specific error types
    const fn1 = asyncFn<CustomErrorType>()(async (n: number) => {
      if (n < 0) throw new CustomError("Negative input");
      return n * 2;
    });

    const fn2 = (n: number) =>
      asyncFn<OtherErrorType>()(async () => {
        if (n > 100) throw new OtherError("Result too large");
        return n + 10;
      });

    const composed = composeFns(fn1, fn2);

    // Normal case
    const result = await composed.fn(5);
    expect(result).toBe(20); // (5 * 2) + 10 = 20

    // Error from first function
    try {
      await composed.fn(-5);
      fail("Should have thrown CustomError");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect((error as CustomErrorType).message).toBe("Negative input");
    }

    // Error from second function
    try {
      await composed.fn(60); // 60 * 2 = 120, which is > 100
      fail("Should have thrown OtherError");
    } catch (error) {
      expect(error).toBeInstanceOf(OtherError);
      expect((error as OtherErrorType).message).toBe("Result too large");
    }
  });
});
