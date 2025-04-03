import { mkErrClass } from "../core/mkErrClass";
import { ResultError } from "../types/Result";

/**
 * A special error type for representing multiple collected errors
 * @template E The error type contained in the collection
 */
export type CollectedErrorData<E extends Error = Error> = {
  errors: ResultError<E>[];
};

export const CollectedErrors = mkErrClass<
  CollectedErrorData,
  "CollectedErrors"
>("CollectedErrors", "COLLECTED_ERRORS", { errors: [] });
