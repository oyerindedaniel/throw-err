/**
 * Represents an error code that can be used to identify specific error types
 */
export type ErrorCode = string;

/**
 * Common error codes
 */
export const CommonErrorCodes = {
  UNKNOWN: "UNKNOWN_ERROR",
  TIMEOUT: "TIMEOUT_ERROR",
  NETWORK: "NETWORK_ERROR",
  VALIDATION: "VALIDATION_ERROR",
  PERMISSION: "PERMISSION_ERROR",
  NOT_FOUND: "NOT_FOUND_ERROR",
} as const;

export type CommonErrorCode =
  (typeof CommonErrorCodes)[keyof typeof CommonErrorCodes];
