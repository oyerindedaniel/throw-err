import { mapperFn } from "../utils/mapperFn";

describe("mapperFn", () => {
  test("mapperFn creates a function that returns a wrapped function", () => {
    const mapper = mapperFn<Error>()((x: number) => x * 2);

    expect(typeof mapper).toBe("object");
    expect(typeof mapper.fn).toBe("function");

    const result = mapper.fn(5);
    expect(result).toBe(10);
  });

  test("mapperFn handles async functions", async () => {
    const asyncMapper = mapperFn<Error>()(async (x: number) => {
      return x * 3;
    });

    const result = await asyncMapper.fn(5);
    expect(result).toBe(15);
  });

  test("mapperFn passes through errors", async () => {
    const errorMapper = mapperFn<Error>()(async () => {
      throw new Error("Mapper error");
    });

    try {
      await errorMapper.fn(10);
      fail("Should have thrown an error");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Mapper error");
    }
  });
});
