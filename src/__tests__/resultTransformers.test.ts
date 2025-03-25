import {
  mapResult,
  flatMapResult,
  mapErr,
  catchErr,
} from "../utils/resultTransformers";
import { mkErrClass } from "../core/mkErrClass";
import { ErrorCode } from "../core/ErrorCode";
import { mapperFn } from "../utils/mapperFn";

describe("resultTransformers", () => {
  // Test for mapResult
  test("mapResult transforms success data", async () => {
    const successResult = { success: true as const, data: 5 };
    const mapper = mapperFn<Error>()((x: number) => x * 2);
    const mapped = await mapResult(successResult, mapper);

    expect(mapped.success).toBe(true);
    expect(mapped.data).toBe(10);
  });

  test("mapResult passes through error", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Test error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Test error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    const mapper = mapperFn<Error>()((x: number) => x * 2);
    const mapped = await mapResult(errorResult, mapper);

    expect(mapped.success).toBe(false);
    expect(mapped.error).toBe(errorResult.error);
  });

  test("mapResult handles mapper throwing error", async () => {
    const successResult = { success: true as const, data: 5 };
    const MapperError = mkErrClass("MapperError", "MAPPER_ERROR");
    const mapper = mapperFn<InstanceType<typeof MapperError>>()(() => {
      throw new MapperError("Mapper failed");
    });

    const mapped = await mapResult(successResult, mapper);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.message).toBe("Mapper failed");
      expect(mapped.error.code).toBe("MAPPER_ERROR");
      expect(mapped.error.raw).toBeInstanceOf(MapperError);
    }
  });

  // Test for flatMapResult
  test("flatMapResult chains success results", async () => {
    const successResult = { success: true as const, data: 5 };
    const mapper = mapperFn<Error>()((x: number) => {
      return Promise.resolve({ success: true as const, data: x * 3 });
    });
    const mapped = await flatMapResult(successResult, mapper);

    expect(mapped.success).toBe(true);
    expect(mapped.data).toBe(15);
  });

  test("flatMapResult passes through error from first result", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Test error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Test error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    const mapper = mapperFn<Error>()((x: number) => {
      return Promise.resolve({ success: true as const, data: x * 3 });
    });
    const mapped = await flatMapResult(errorResult, mapper);

    expect(mapped.success).toBe(false);
    expect(mapped.error).toBe(errorResult.error);
  });

  test("flatMapResult handles error from mapper function", async () => {
    const successResult = { success: true as const, data: 5 };
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Mapper error");

    const mapper = mapperFn<Error>()(() => {
      return Promise.resolve({
        success: false as const,
        error: {
          message: "Mapper error",
          code: "CUSTOM_ERROR" as ErrorCode,
          raw: errorObj,
        },
      });
    });
    const mapped = await flatMapResult(successResult, mapper);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.message).toBe("Mapper error");
      expect(mapped.error.raw).toBe(errorObj);
    }
  });

  test("flatMapResult handles mapper throwing error", async () => {
    const successResult = { success: true as const, data: 5 };
    const MapperError = mkErrClass("MapperError", "MAPPER_ERROR");
    const mapper = mapperFn<InstanceType<typeof MapperError>>()(() => {
      throw new MapperError("Mapper failed");
    });

    const mapped = await flatMapResult(successResult, mapper);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.message).toBe("Mapper failed");
      expect(mapped.error.code).toBe("MAPPER_ERROR");
      expect(mapped.error.raw).toBeInstanceOf(MapperError);
    }
  });

  // Test for mapErr
  test("mapErr transforms error", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Original error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Original error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    const newError = new Error("Transformed error");
    const mapped = mapErr(errorResult, () => newError);

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBe(newError);
      expect(mapped.error.message).toBe("Transformed error");
    }
  });

  test("mapErr passes through success", () => {
    const successResult = { success: true as const, data: "success data" };
    const mapped = mapErr(
      successResult,
      () => new Error("Should not be called")
    );

    expect(mapped.success).toBe(true);
    expect(mapped.data).toBe("success data");
  });

  test("mapErr transforms error with no code property", () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Original error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Original error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    class SimpleError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "SimpleError";
      }
    }

    const mapped = mapErr(errorResult, () => new SimpleError("Simple error"));

    expect(mapped.success).toBe(false);
    if (!mapped.success) {
      expect(mapped.error.raw).toBeInstanceOf(SimpleError);
      expect(mapped.error.message).toBe("Simple error");
      expect(mapped.error.code).toBe("UNKNOWN");
    }
  });

  // Test for catchErr
  test("catchErr recovers from error", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const errorObj = new CustomError("Original error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Original error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    const recovered = await catchErr(errorResult, () => {
      return Promise.resolve({ success: true as const, data: "recovery data" });
    });

    expect(recovered.success).toBe(true);
    expect(recovered.data).toBe("recovery data");
  });

  test("catchErr passes through success", async () => {
    const successResult = { success: true as const, data: "original data" };
    const recovered = await catchErr(successResult, () => {
      return Promise.resolve({
        success: true as const,
        data: "should not be returned",
      });
    });

    expect(recovered.success).toBe(true);
    expect(recovered.data).toBe("original data");
  });

  test("catchErr handles error in error handler", async () => {
    const CustomError = mkErrClass("CustomError", "CUSTOM_ERROR");
    const HandlerError = mkErrClass("HandlerError", "HANDLER_ERROR");
    const errorObj = new CustomError("Original error");
    const errorResult = {
      success: false as const,
      error: {
        message: "Original error",
        code: "CUSTOM_ERROR" as ErrorCode,
        raw: errorObj,
      },
    };

    const recovered = await catchErr(errorResult, () => {
      throw new HandlerError("Handler failed");
    });

    expect(recovered.success).toBe(false);
    if (!recovered.success) {
      expect(recovered.error.message).toBe("Handler failed");
      expect(recovered.error.code).toBe("HANDLER_ERROR");
      expect(recovered.error.raw).toBeInstanceOf(HandlerError);
    }
  });
});
