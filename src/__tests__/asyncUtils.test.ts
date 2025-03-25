import { AsyncFnWithErr } from "../core/AsyncFnWithErr";
import { ErrorCode } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";
import { withCode } from "../core/withCode";
import { withRetry, withTimeout, withFallback } from "../core/asyncUtils";
import { asyncFn } from "../core/asyncFn";
import { retry, timeout, TimeoutError } from "../utils/asyncUtils";
import { CommonErrorCodes } from "../core/ErrorCode";

describe("asyncUtils", () => {
  const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
  type CustomErrorType = InstanceType<typeof CustomError>;

  describe("retry", () => {
    test("succeeds immediately if no error", async () => {
      const fn = asyncFn<CustomErrorType>()(async () => "success");
      const result = await retry(fn, 3);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected success");
      expect(result.data).toBe("success");
    });

    test("retries on failure and succeeds eventually", async () => {
      let attempts = 0;
      const fn = asyncFn<CustomErrorType>()(async () => {
        attempts++;
        if (attempts < 3) {
          throw new CustomError("Temporary failure");
        }
        return "success";
      });

      const result = await retry(fn, 3, { delay: 10 });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected success");
      expect(result.data).toBe("success");
      expect(attempts).toBe(3);
    });

    test("fails after max retries", async () => {
      let attempts = 0;
      const fn = asyncFn<CustomErrorType>()(async () => {
        attempts++;
        throw new CustomError("Permanent failure");
      });

      const result = await retry(fn, 2, { delay: 10 });

      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected failure");
      expect(result.error.raw).toBeInstanceOf(CustomError);
      expect(result.error.raw.message).toBe("Permanent failure");
      expect(attempts).toBe(3); // Initial + 2 retries
    });

    test("uses exponential backoff", async () => {
      const delays: number[] = [];
      const sleep = jest.spyOn(global, "setTimeout");

      const fn = asyncFn<CustomErrorType>()(async () => {
        throw new CustomError("Failure");
      });

      await retry(fn, 2, { delay: 100, exponential: true });

      sleep.mock.calls.forEach((call) => {
        delays.push(call[1] as number);
      });

      expect(delays).toEqual([100, 200]); // 100ms, then 200ms
      sleep.mockRestore();
    });
  });

  describe("timeout", () => {
    test("succeeds within timeout", async () => {
      const fn = asyncFn<CustomErrorType>()(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      });

      const result = await timeout(fn, 100);

      expect(result.success).toBe(true);
      if (!result.success) throw new Error("Expected success");
      expect(result.data).toBe("success");
    });

    test("fails on timeout", async () => {
      const fn = asyncFn<CustomErrorType>()(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return "success";
      });

      const result = await timeout(fn, 10);

      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected failure");
      expect(result.error.raw).toBeInstanceOf(TimeoutError);
      expect(result.error.code).toBe(CommonErrorCodes.TIMEOUT);
    });

    test("preserves original error if thrown before timeout", async () => {
      const fn = asyncFn<CustomErrorType>()(async () => {
        throw new CustomError("Original error");
      });

      const result = await timeout(fn, 100);

      expect(result.success).toBe(false);
      if (result.success) throw new Error("Expected failure");
      expect(result.error.raw).toBeInstanceOf(CustomError);
      expect(result.error.raw.message).toBe("Original error");
    });
  });

  describe("withFallback", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    type CustomErrorType = InstanceType<typeof CustomError>;

    test("uses primary function on success", async () => {
      const primary = withCode<CustomErrorType>("FETCH_ERROR")(
        async () => "primary result"
      );
      const fallback = withCode<CustomErrorType>("FALLBACK_ERROR")(
        async () => "fallback result"
      );

      const fn = withFallback<CustomErrorType>(fallback)(primary);
      const result = await fn.fn();

      expect(result).toBe("primary result");
    });

    test("uses fallback on primary failure", async () => {
      const primary = withCode<CustomErrorType>("FETCH_ERROR")(async () => {
        throw new CustomError("Primary failed");
      });
      const fallback = withCode<CustomErrorType>("FALLBACK_ERROR")(
        async () => "fallback result"
      );

      const fn = withFallback<CustomErrorType>(fallback)(primary);
      const result = await fn.fn();

      expect(result).toBe("fallback result");
    });

    test("throws if both functions fail", async () => {
      const primary = withCode<CustomErrorType>("FETCH_ERROR")(async () => {
        throw new CustomError("Primary failed");
      });
      const fallback = withCode<CustomErrorType>("FALLBACK_ERROR")(async () => {
        throw new CustomError("Fallback failed");
      });

      const fn = withFallback<CustomErrorType>(fallback)(primary);
      await expect(fn.fn()).rejects.toThrow("Fallback failed");
    });
  });
});
