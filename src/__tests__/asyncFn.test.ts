import { asyncFn } from "../core/asyncFn";

describe("asyncFn", () => {
  test("asyncFn creates a function that returns AsyncFnWithErr", async () => {
    const fn = asyncFn<Error>()(async (x: number) => x * 2);

    expect(typeof fn).toBe("object");
    expect(typeof fn.fn).toBe("function");

    const result = await fn.fn(5);
    expect(result).toBe(10);
  });

  test("asyncFn handles multiple arguments", async () => {
    const addFn = asyncFn<Error>()(
      async (a: number, b: number, c: number) => a + b + c
    );

    const result = await addFn.fn(1, 2, 3);
    expect(result).toBe(6);
  });
});
