/**
 * Main entry point for the throw-err package
 */

export const version = "0.1.0";

// Add your error handling utilities here
export const throwError = (message: string): never => {
  throw new Error(message);
};
