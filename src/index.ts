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
export {
  MapperFn,
  mapperFn,
  MapperFnAsync,
  mapperFnAsync,
} from "./utils/mapperFn";

// Chainable Result API
export { ChainableResult, Success, Failure } from "./utils/chainableResult";

// Core functions
export { asyncFn } from "./core/asyncFn";
export { tryCatchAsync, tryCatch } from "./core/tryCatch";
export { mkErrClass } from "./core/mkErrClass";
export { withCode } from "./core/withCode";
export { compose, composeFns, composeMany } from "./core/compose";

// Utility functions
export {
  map,
  mapAsync,
  mapWith,
  mapWithAsync,
  flatMapWith,
  flatMapWithAsync,
  flatMap,
  flatMapAsync,
  recover,
  recoverAsync,
  mapErr,
  mapErrAsync,
  transform,
  transformAsync,
  transformWith,
  transformWithAsync,
  orElse,
  orElseAsync,
  filter,
  collectResults,
  combineAll,
  sequenceResults,
  tap,
  tapErr,
  getOrElse,
  toPromise,
  fromPromise,
} from "./utils/resultTransformers";

export { CollectedErrors } from "./utils/customErrors";

export { retry, timeout, TimeoutError } from "./utils/asyncUtils";

// export { compose } from "./utils/compose";

// Error type checking utilities
export {
  isErrorType,
  hasErrorName,
  hasProperty,
  createErrorTypeGuard,
} from "./utils/errorTypeUtils";

// Error normalization utilities
export {
  normalizeError,
  normalizeTypedError,
  isResultError,
} from "./utils/normalizeError";
