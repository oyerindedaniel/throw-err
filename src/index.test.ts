import { throwError } from "./index";

describe("throwError", () => {
  it("should throw an error with the provided message", () => {
    expect(() => throwError("Test error")).toThrow("Test error");
  });
});
