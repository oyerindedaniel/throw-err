import { groupFn } from "../core/groupFn";
import { mkErrClass } from "../core/mkErrClass";
import { CommonErrorCodes } from "../core/ErrorCode";
import { Result } from "../types/Result";

// Define user-related error types
const UserFetchError = mkErrClass("UserFetchError", CommonErrorCodes.NETWORK, {
  userId: "",
});
const UserValidationError = mkErrClass(
  "UserValidationError",
  CommonErrorCodes.VALIDATION,
  { field: "", reason: "" }
);
const UserProcessingError = mkErrClass(
  "UserProcessingError",
  "PROCESSING_ERROR",
  { step: "" }
);

// Define our user type
interface User {
  id: string;
  name: string;
  email?: string;
  role: "admin" | "user";
}

// Define a base error type for all user operations
type UserError =
  | InstanceType<typeof UserFetchError>
  | InstanceType<typeof UserValidationError>
  | InstanceType<typeof UserProcessingError>;

// Define our API interface with typed methods
interface UserApi {
  validate: (user: User) => Result<User, UserError>;
  formatName: (name: string) => Result<string, UserError>;
  fetch: (id: string) => Promise<Result<User, UserError>>;
  enrichProfile: (user: User) => Promise<Result<User, UserError>>;
}

// Create a group for user operations
const userOperations = groupFn<UserError>({
  namePrefix: "user",
  defaultOptions: { autoWrap: true },
});

// Add synchronous functions
userOperations.addSync("validate")<InstanceType<typeof UserValidationError>>()(
  (user: User) => {
    if (!user.name) {
      const error = new UserValidationError("Name is required");
      error.data.field = "name";
      error.data.reason = "Missing required field";
      throw error;
    }

    if (!user.email?.includes("@")) {
      const error = new UserValidationError("Invalid email format");
      error.data.field = "email";
      error.data.reason = "Email must contain @ symbol";
      throw error;
    }

    return user;
  }
);

userOperations.addSync("formatName")<
  InstanceType<typeof UserProcessingError>
>()((name: string) => {
  try {
    return name
      .trim()
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  } catch (err) {
    const error = new UserProcessingError("Failed to format name");
    error.data.step = "name-formatting";
    throw error;
  }
});

// Add asynchronous functions
userOperations.addAsync("fetch")<InstanceType<typeof UserFetchError>>()(
  async (id: string) => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Intentionally fail sometimes
    if (id === "999") {
      const error = new UserFetchError(`Failed to fetch user with ID ${id}`);
      error.data.userId = id;
      throw error;
    }

    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      role: Math.random() > 0.5 ? "admin" : "user",
    };
  }
);

userOperations.addAsync("enrichProfile")<
  InstanceType<typeof UserProcessingError>
>()(async (user: User) => {
  // Simulate API call to get additional data
  await new Promise((resolve) => setTimeout(resolve, 50));

  try {
    const formatResult = userOperations.executeSync<
      string,
      InstanceType<typeof UserProcessingError>,
      [string]
    >("formatName", user.name);

    // Ensure we have a string for the name
    const formattedName = formatResult.success ? formatResult.data : user.name;

    return {
      ...user,
      name: formattedName,
    };
  } catch (err) {
    const error = new UserProcessingError("Failed to enrich user profile");
    error.data.step = "profile-enrichment";
    throw error;
  }
});

// Example usage
async function runExample() {
  console.log("Function Group Example - User Operations");
  console.log("----------------------------------------");

  // List available functions
  console.log("Available functions:", userOperations.list());

  // 1. Fetch a user
  console.log("\n1. Fetching a user");
  const userResult = await userOperations.executeAsync<
    User,
    InstanceType<typeof UserFetchError>,
    [string]
  >("fetch", "123");

  if (userResult.success) {
    console.log("✅ User fetched successfully:", userResult.data);

    // 2. Validate the user
    console.log("\n2. Validating user");
    const validationResult = userOperations.executeSync<
      User,
      InstanceType<typeof UserValidationError>,
      [User]
    >("validate", userResult.data);

    if (validationResult.success) {
      console.log("✅ User is valid");

      // 3. Enrich the user profile
      console.log("\n3. Enriching user profile");
      const enrichedResult = await userOperations.executeAsync<
        User,
        InstanceType<typeof UserProcessingError>,
        [User]
      >("enrichProfile", validationResult.data);

      if (enrichedResult.success) {
        console.log("✅ User profile enriched:", enrichedResult.data);
      } else {
        console.log("❌ Failed to enrich profile:", enrichedResult.error);
      }
    } else {
      console.log("❌ User validation failed:", validationResult.error);
    }
  } else {
    console.log("❌ Failed to fetch user:", userResult.error);
  }

  // 4. Try to fetch a non-existent user (will fail)
  console.log("\n4. Trying to fetch a non-existent user");
  const badUserResult = await userOperations.executeAsync<
    User,
    InstanceType<typeof UserFetchError>,
    [string]
  >("fetch", "999");

  if (badUserResult.success) {
    console.log("✅ User fetched successfully:", badUserResult.data);
  } else {
    console.log("❌ Failed to fetch user:", badUserResult.error);

    // Access typed error information
    if (badUserResult.error.raw instanceof UserFetchError) {
      console.log(
        `   Error details - User ID: ${badUserResult.error.raw.data.userId}`
      );
    }
  }

  // 5. Create an API from the group
  console.log("\n5. Using the API created from the group");
  const api = userOperations.createApi<UserApi>();

  const userFromApi = await api.fetch("456");
  console.log(
    "User from API:",
    userFromApi.success ? "✅ Success" : "❌ Failed"
  );

  if (userFromApi.success) {
    const validatedUser = api.validate(userFromApi.data);
    console.log(
      "Validated user from API:",
      validatedUser.success ? "✅ Success" : "❌ Failed"
    );
  }
}

// Export the example for use elsewhere
export { userOperations, runExample, UserApi, UserError };
