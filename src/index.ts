/**
 * throw-err: A TypeScript error handling utility that maintains proper type inference for errors in async functions
 * @packageDocumentation
 */

// Version
export const version = "0.1.0";

// Core types
export { Result, ResultError } from "./types/Result";
export { AsyncFnWithErr } from "./core/AsyncFnWithErr";
export { ErrorCode, CommonErrorCodes, CommonErrorCode } from "./core/ErrorCode";
export { MapperFn, mapperFn } from "./utils/mapperFn";

// Core functions
export { asyncFn } from "./core/asyncFn";
export { tryCatch, tryCatchSync } from "./core/tryCatch";
export { mkErrClass } from "./core/mkErrClass";
export { withCode } from "./core/withCode";
export { compose, composeFns, composeMany } from "./core/compose";

// Utility functions
export {
  mapResult,
  mapResultSync,
  flatMapResult,
  flatMapResultSync,
  catchErr,
  catchErrSync,
  mapErr,
  recover,
  filterResult,
  collectResults,
  CollectedErrors,
} from "./utils/resultTransformers";

export { retry, timeout, TimeoutError } from "./utils/asyncUtils";

// export { compose } from "./utils/compose";

// Error type checking utilities
export {
  isErrorType,
  hasErrorName,
  hasProperty,
  createErrorTypeGuard,
  createConstrainedErrorGuard,
} from "./utils/errorTypeUtils";

// Error normalization utilities
export {
  normalizeError,
  normalizeTypedError,
  isResultError,
} from "./utils/normalizeError";
