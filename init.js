#!/usr/bin/env node

/**
 * A simple initialization script to help set up the throw-err package.
 */

const { execSync } = require("child_process");
const { existsSync, mkdirSync } = require("fs");

console.log("🚀 Initializing throw-err package...");

// Create examples directory if it doesn't exist
if (!existsSync("./examples")) {
  console.log("📁 Creating examples directory...");
  mkdirSync("./examples");
}

// Install dependencies
console.log("📦 Installing dependencies using pnpm...");
try {
  execSync("pnpm install", { stdio: "inherit" });
} catch (error) {
  console.error("❌ Failed to install dependencies:", error.message);
  process.exit(1);
}

// Build the package
console.log("🔨 Building the package...");
try {
  execSync("pnpm run build", { stdio: "inherit" });
} catch (error) {
  console.error("❌ Failed to build the package:", error.message);
  process.exit(1);
}

// Run tests
console.log("🧪 Running tests...");
try {
  execSync("pnpm test", { stdio: "inherit" });
} catch (error) {
  console.error("❌ Some tests failed:", error.message);
  // Continue anyway
}

console.log("\n✅ throw-err package initialized successfully!");
console.log("\nNext steps:");
console.log("  1. Explore the API in src/");
console.log("  2. Run examples with: pnpm run example:basic");
console.log("  3. Read the documentation in DOCUMENTATION.md");
console.log("\nHappy coding! 🎉");

process.exit(0);
