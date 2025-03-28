/**
 * Executes a function and determines its return type at compile time.
 * If the function is async, it returns a Promise<T>, otherwise returns T.
 */

// Overload for sync functions
function execute<T>(fn: () => T): T;

// Overload for async functions
function execute<T>(fn: () => Promise<T>): Promise<T>;

// Implementation
function execute<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return fn();
}

// Example Usage:

// Sync function
function syncFunc() {
  return 42;
}

// Async function
async function asyncFunc() {
  return "Hello, async!";
}

// TypeScript will correctly infer:
const syncResult = execute(syncFunc); // Type: number
const asyncResult = execute(asyncFunc); // Type: Promise<string>

// Example with async function and awaiting result
async function test() {
  console.log(await execute(asyncFunc)); // "Hello, async!"
  console.log(execute(syncFunc)); // 42
}

test();
