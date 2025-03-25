import { CommonErrorCodes } from "../core/ErrorCode";

describe("ErrorCode", () => {
  test("CommonErrorCodes exports standard error codes", () => {
    expect(CommonErrorCodes.UNKNOWN).toBe("UNKNOWN_ERROR");
    expect(CommonErrorCodes.TIMEOUT).toBe("TIMEOUT_ERROR");
    expect(CommonErrorCodes.NETWORK).toBe("NETWORK_ERROR");
    expect(CommonErrorCodes.VALIDATION).toBe("VALIDATION_ERROR");
    expect(CommonErrorCodes.PERMISSION).toBe("PERMISSION_ERROR");
    expect(CommonErrorCodes.NOT_FOUND).toBe("NOT_FOUND_ERROR");
  });
});
