/**
 * Logger utility for development use only
 * This utility helps debug composition chains and function wrappers
 */

import { normalizeError } from "./normalizeError";

/**
 * Log levels for controlling verbosity
 */
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/**
 * Global configuration for the logger
 */
export const loggerConfig = {
  /**
   * Current log level - controls which messages are displayed
   * Default to NONE in production, can be set higher in development
   */
  level: process.env.NODE_ENV === "production" ? LogLevel.NONE : LogLevel.TRACE,

  /**
   * Enable/disable function tracing (entry/exit logs)
   */
  traceEnabled: process.env.NODE_ENV !== "production",

  /**
   * Whether to include timestamps in logs
   */
  showTimestamps: true,

  /**
   * Whether to include the caller name in logs
   */
  showCaller: true,
};

/**
 * Format a log message with optional context
 */
function formatMessage(
  level: string,
  message: string,
  context?: string
): string {
  const parts: string[] = [];

  if (loggerConfig.showTimestamps) {
    parts.push(`[${new Date().toISOString()}]`);
  }

  parts.push(`[${level}]`);

  if (context && loggerConfig.showCaller) {
    parts.push(`[${context}]`);
  }

  parts.push(message);

  return parts.join(" ");
}

/**
 * Logger interface
 */
export interface Logger {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
  debug(message: string): void;
  trace(message: string): void;
  startTrace(args?: readonly unknown[]): void;
  endTrace(result?: unknown): void;
}

/**
 * Create a named logger instance
 * @param context The name of the component/function using this logger
 * @returns A Logger instance
 */
export function createLogger(context: string): Logger {
  let traceDepth = 0;

  return {
    error(message: string): void {
      if (loggerConfig.level >= LogLevel.ERROR) {
        console.error(formatMessage("ERROR", message, context));
      }
    },

    warn(message: string): void {
      if (loggerConfig.level >= LogLevel.WARN) {
        console.warn(formatMessage("WARN", message, context));
      }
    },

    info(message: string): void {
      if (loggerConfig.level >= LogLevel.INFO) {
        console.info(formatMessage("INFO", message, context));
      }
    },

    debug(message: string): void {
      if (loggerConfig.level >= LogLevel.DEBUG) {
        console.debug(formatMessage("DEBUG", message, context));
      }
    },

    trace(message: string): void {
      if (loggerConfig.level >= LogLevel.TRACE) {
        console.debug(formatMessage("TRACE", message, context));
      }
    },

    startTrace(args?: readonly unknown[]): void {
      if (loggerConfig.traceEnabled && loggerConfig.level >= LogLevel.TRACE) {
        const indent = "  ".repeat(traceDepth);
        const argsStr = args
          ? args
              .map((a) =>
                typeof a === "object"
                  ? a instanceof Error
                    ? `Error(${a.name}: ${a.message})`
                    : JSON.stringify(a).substring(0, 100)
                  : String(a)
              )
              .join(", ")
          : "";

        console.debug(
          formatMessage("TRACE", `${indent}→ ${context}(${argsStr})`, context)
        );
        traceDepth++;
      }
    },

    endTrace(result?: unknown): void {
      if (loggerConfig.traceEnabled && loggerConfig.level >= LogLevel.TRACE) {
        traceDepth = Math.max(0, traceDepth - 1);
        const indent = "  ".repeat(traceDepth);
        const resultStr =
          result !== undefined
            ? result instanceof Error
              ? `Error(${(result as Error).name}: ${(result as Error).message})`
              : typeof result === "object"
              ? JSON.stringify(result).substring(0, 100)
              : String(result)
            : "void";

        console.debug(
          formatMessage(
            "TRACE",
            `${indent}← ${context} returned ${resultStr}`,
            context
          )
        );
      }
    },
  };
}

/**
 * Create a wrapped function that logs entry and exit
 * @param name Function name for logging
 * @param fn The function to wrap
 * @returns A wrapped function with the same signature
 */
export function withLogging<T, Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => T | Promise<T>
): (...args: Args) => Promise<T> {
  const logger = createLogger(name);

  return async (...args: Args): Promise<T> => {
    logger.startTrace(args);
    try {
      const result = await fn(...args);
      logger.endTrace(result);
      return result;
    } catch (error) {
      logger.error(`Function failed: ${normalizeError(error).message}`);
      logger.endTrace(error);
      throw error;
    }
  };
}

/**
 * Create a wrapper function that adds logging to any AsyncFnWithErr/SyncFnWithErr
 * Useful for composition chains
 */
export function createLoggingWrapper(wrapperName: string) {
  const logger = createLogger(wrapperName);

  return function loggingWrapper<T, Args extends readonly unknown[]>(
    fn: (...args: Args) => Promise<T>
  ): (...args: Args) => Promise<T> {
    return async (...args: Args): Promise<T> => {
      logger.debug(`Calling wrapped function with ${args.length} arguments`);
      logger.startTrace(args);
      try {
        const result = await fn(...args);
        logger.debug("Function completed successfully");
        logger.endTrace(result);
        return result;
      } catch (error) {
        logger.error(`Function failed: ${normalizeError(error).message}`);
        logger.endTrace(error);
        throw error;
      }
    };
  };
}
