import { AsyncFnWithErr } from "../core/AsyncFnWithErr";

describe("AsyncFnWithErr", () => {
  test("constructor creates an instance with the provided function", async () => {
    const testFn = async (x: number) => x * 2;
    const asyncFnInstance = new AsyncFnWithErr(testFn);

    expect(asyncFnInstance.fn).toBe(testFn);
    expect(await asyncFnInstance.fn(5)).toBe(10);
  });

  test("AsyncFnWithErr can be called with arguments", async () => {
    const add = async (a: number, b: number) => a + b;
    const asyncFnInstance = new AsyncFnWithErr(add);

    const result = await asyncFnInstance.fn(3, 4);
    expect(result).toBe(7);
  });
});
