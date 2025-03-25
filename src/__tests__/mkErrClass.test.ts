import { mkErrClass } from "../core/mkErrClass";

describe("mkErrClass", () => {
  test("creates simple error classes without defaultData", () => {
    // No type parameter - this should work
    const SimpleError = mkErrClass("SimpleError", "SIMPLE_ERROR");
    const error = new SimpleError("Simple error");

    expect(error.name).toBe("SimpleError");
    expect(error.code).toBe("SIMPLE_ERROR");
    expect(error.data).toEqual(undefined);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof SimpleError).toBe(true);
  });

  test("creates typed error classes with defaultData", () => {
    interface TestErrorData extends Record<string, unknown> {
      id: number;
      message: string;
    }

    // With type parameter and defaultData - this should work
    const TypedError = mkErrClass<TestErrorData>("TypedError", "TYPED_ERROR", {
      id: 0,
      message: "",
    });

    const error = new TypedError("Typed error");

    expect(error.name).toBe("TypedError");
    expect(error.code).toBe("TYPED_ERROR");
    expect(error.data).toEqual({ id: 0, message: "" });

    // We can override the default data
    const customError = new TypedError("Custom error", {
      data: { id: 123, message: "Custom message" },
    });

    expect(customError.data.id).toBe(123);
    expect(customError.data.message).toBe("Custom message");
  });

  test("error data is accessible with correct properties", () => {
    // Plain interface without Record<string, unknown>
    interface UserErrorData {
      userId: string;
      role: string;
    }

    const UserError = mkErrClass<UserErrorData>("UserError", "USER_ERROR", {
      userId: "",
      role: "guest",
    });

    const error = new UserError("User error");

    // TypeScript should know these properties exist
    expect(error.data.userId).toBe("");
    expect(error.data.role).toBe("guest");

    // Now this should properly cause a type error
    // @ts-expect-error - Property 'nonExistent' does not exist on type 'UserErrorData'
    expect(error.data.nonExistent).toBeUndefined();
  });

  // This test should fail TypeScript compilation:
  // Uncomment to verify TypeScript catches the error
  /* 
  test("typed error without defaultData should fail TypeScript", () => {
    interface RequiredData extends Record<string, unknown> {
      required: string;
    }
    
    // This should cause a TypeScript error:
    // Argument of type 'string' is not assignable to parameter of type 'RequiredData'
    const BadError = mkErrClass<RequiredData>("BadError", "BAD_ERROR");
  });
  */
});
