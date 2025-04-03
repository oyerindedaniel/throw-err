import { ChainableResult } from "../utils/chainableResult";
import { syncFn } from "../core/syncFn";
import { asyncFn } from "../core/asyncFn";
import { CommonErrorCodes } from "../core/ErrorCode";
import { mkErrClass } from "../core/mkErrClass";
import { Result, ResultError } from "../types/Result";
import { mapperFn } from "../utils/mapperFn";
import { isErrorType } from "../utils/errorTypeUtils";

// ========== CUSTOM ERROR TYPES ==========

// Define custom error type properties
type NetworkErrorData = {
  retryable: boolean;
  statusCode: number;
};

type ProcessingErrorData = {
  step: string;
};

// Custom error types using mkErrClass
const ParseError = mkErrClass("ParseError", CommonErrorCodes.VALIDATION);
const ValidationError = mkErrClass(
  "ValidationError",
  CommonErrorCodes.VALIDATION
);
const NetworkError = mkErrClass<NetworkErrorData, "NetworkError">(
  "NetworkError",
  CommonErrorCodes.NETWORK,
  {
    retryable: false,
    statusCode: 0,
  }
);
const ProcessingError = mkErrClass<ProcessingErrorData, "ProcessingError">(
  "ProcessingError",
  "PROCESSING_ERROR",
  {
    step: "",
  }
);

// Define errors for HTTP operations
const RequestError = mkErrClass<{ url: string; method: string }, "RequestError">(
  "RequestError", 
  CommonErrorCodes.NETWORK,
  { url: "", method: "GET" }
);

const ResponseError = mkErrClass<{statusCode: number; retryable: boolean}, "ResponseError">(
  "ResponseError",
  CommonErrorCodes.NETWORK,
  { statusCode: 0, retryable: true }
);

const TimeoutError = mkErrClass<{timeoutMs: number}, "TimeoutError">(
  "TimeoutError",
  CommonErrorCodes.TIMEOUT,
  { timeoutMs: 0 }
);

type HttpError = InstanceType<typeof RequestError> | 
                InstanceType<typeof ResponseError> | 
                InstanceType<typeof TimeoutError>;

// Form validation error
const FormValidationError = mkErrClass<{ fieldErrors: FormErrors }, "FormValidationError">(
  "FormValidationError",
  CommonErrorCodes.VALIDATION,
  { fieldErrors: {} }
);

// Database error
const DatabaseError = mkErrClass<{ operation: string; tableName: string }, "DatabaseError">(
  "DatabaseError",
  "DATABASE_ERROR",
  { operation: "", tableName: "" }
);

// Transaction error
const TransactionError = mkErrClass<{ step: string; rollbacked: boolean }, "TransactionError">(
  "TransactionError",
  "TRANSACTION_ERROR",
  { step: "", rollbacked: false }
);

// ========== TYPE DEFINITIONS ==========

// Form data types
type FormData = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  age?: number;
};

type FormErrors = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  age?: string;
};

// Database entity types
type User = { id: string; name: string; email: string; };
type Post = { id: string; title: string; content: string; userId: string; };
type Comment = { id: string; postId: string; text: string; userId: string; };

// ========== EXAMPLE IMPLEMENTATIONS ==========

// Example 1: Basic method chaining with parsing and validation
function parseAndValidateNumber(input: string): number {
  // Create a wrapped synchronous function
  const parseNumber = syncFn<InstanceType<typeof ParseError>>()(
    (input: string): number => {
      const num = Number(input);
      if (isNaN(num))
        throw new ParseError(`Cannot parse "${input}" as a number`);
      return num;
    }
  );
  
  // Using the new tryCatch method for a cleaner chain
  return (
    ChainableResult.tryCatch(parseNumber, input)
      // Transform the value if successful
      .map((num) => num * 2)
      // Add validation
      .filter(
        (num) => num > 0,
        (num) => new ValidationError(`Value ${num} must be positive`)
      )
      // Map errors to a different type if needed
      .mapErr((error) => {
        if (error.name === "ParseError") {
          return new Error(`Invalid input: ${error.message}`);
        }
        return error;
      })
      // Extract the value or provide a default
      .getOrElse(0)
  );
}

// Example 2: Recovery and side effects
function processUserInput(input: string) {
  return (
    ChainableResult.success(input)
      // Apply transformations
      .map((str) => str.trim())
      .filter(
        (str) => str.length > 0,
        () => new ValidationError("Input cannot be empty")
      )
      // Apply side effects on success
      .tap((value) => {
        console.log(`Processing: ${value}`);
      })
      // Apply side effects on error
      .tapErr((error) => {
        console.error(`Error: ${error.message}`);
      })
      // Convert to a standard Result type
      .toResult()
  );
}

// Example 3: Converting between standard and chainable Result types and using async
async function fetchAndProcessData() {
  // Create a mock fetch function with proper error handling
  const fetchData = asyncFn<Error>()(() => {
    return Promise.resolve({ id: "123", name: "Example Data" });
  });

  // Using the tryCatchAsync method for async operations
  const result = await ChainableResult.tryCatchAsync(fetchData);

  // Now we can use the chainable methods on the result
  return (
    result
      .map((data) => {
        // Process the data
        return {
          ...data,
          processedAt: new Date(),
        };
      })
      .recover(
        mapperFn<Error>()(
          (error: ResultError<Error>) => {
            // Handle network errors with a fallback
            if (error.code === CommonErrorCodes.NETWORK) {
              return ChainableResult.success({
                offline: true,
                message: "Using offline data",
              });
            }
            // Re-throw other errors
            return ChainableResult.failure(error);
          }
        )
      )
      // Convert back to a standard Result
      .toResult()
  );
}

// Example 4: MapperFn with advanced error typing
async function usingMapperFunctions() {
  // Create typed mappers
  const validateNumber = mapperFn<InstanceType<typeof ValidationError>>()(
    (num: number) => {
      if (num <= 0) {
        throw new ValidationError("Number must be positive");
      }
      return num * 2;
    }
  );

  const processData = mapperFn<InstanceType<typeof ProcessingError>>()(
    (data: { value: number }) => {
      try {
        return {
          result: data.value * 10,
          processed: true,
        };
      } catch (err) {
        const error = new ProcessingError("Failed to process data");
        error.data.step = "multiplication";
        throw error;
      }
    }
  );

  // Create a test result
  const result = ChainableResult.success(5);
  const negativeResult = ChainableResult.success(-5);

  // Use mapWithMapper for type-safe error handling
  const mappedResult = await result.mapWith(validateNumber);
  const failedMapping = await negativeResult.mapWith(validateNumber);

  console.log("Mapped with mapper (success):", mappedResult);
  console.log("Mapped with mapper (failure):", failedMapping);

  // Create data result
  const dataResult = ChainableResult.success({ value: 10 });

  // Create a properly typed mapper for the flat map operation
  const flatMapped = await dataResult.flatMapWith(mapperFn<InstanceType<typeof ProcessingError>>()(
    (data) => {
      if (data.value > 0) {
        const processed = processData.fn(data);
        return Result.success(processed);
      } else {
        return Result.fromError(new ProcessingError("Cannot process non-positive values"));
      }
    }
  ));

  console.log("Flat mapped result:", flatMapped);

  return { mappedResult, failedMapping, flatMapped };
}

// Example 5: Async operations with proper chaining
async function asyncOperationsExample() {
  // Create an async function that may fail
  type UserData = {
    id: string;
    name: string;
    email: string | null;
  };

  const fetchUser = async (id: string): Promise<UserData> => {
    // Simulate network request
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (id === "error") {
      throw new NetworkError("Failed to fetch user data", {
        data: {
          statusCode: 404,
          retryable: false,
        },
      });
    }

    return { id, name: `User ${id}`, email: `user${id}@example.com` };
  };

  // Wrap the fetchUser function with asyncFn
  const fetchUserWrapped =
    asyncFn<InstanceType<typeof NetworkError>>()(fetchUser);

  // Create a promise by calling the function directly
  const successPromise = fetchUserWrapped.fn("123");
  const errorPromise = fetchUserWrapped.fn("error");

  // Convert promises to chainable results
  const successResult = await ChainableResult.fromPromise<
    UserData,
    InstanceType<typeof NetworkError>
  >(successPromise);
  const errorResult = await ChainableResult.fromPromise<
    UserData,
    InstanceType<typeof NetworkError>
  >(errorPromise);

  // Map async example with proper typing
  const mappedAsync = await successResult.mapAsync(async (user) => {
    // Simulate fetching additional data
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      lastLogin: new Date(),
      active: true,
    };
  });

  // FlatMap async example with proper typing
  const flatMappedAsync = await successResult.flatMapAsync(
    async (user) => {
      // Simulate fetching posts
      await new Promise((resolve) => setTimeout(resolve, 50));

      return ChainableResult.success({
        user,
        posts: [
          { id: "p1", title: "First post" },
          { id: "p2", title: "Second post" },
        ],
      });
    }
  );

  // Recover from errors with async operation
  const recovered = await errorResult.recover(
    mapperFn<InstanceType<typeof NetworkError>>()(
      (error) => {
        if (
          isErrorType(error.raw, NetworkError) &&
          error.raw.data.statusCode === 404
        ) {
          return ChainableResult.success<UserData>({
            id: "unknown",
            name: "Guest User",
            email: null,
          });
        }
        return ChainableResult.failure(error);
      }
    )
  );

  console.log("Async success result:", successResult);
  console.log("Async error result:", errorResult);
  console.log("Mapped async:", mappedAsync);
  console.log("Flat mapped async:", flatMappedAsync);
  console.log("Recovered async:", recovered);

  return {
    successResult,
    errorResult,
    mappedAsync,
    flatMappedAsync,
    recovered,
  };
}

// Example 6: API Request with Retries
async function fetchWithRetry<T>(url: string, options = {}, maxRetries = 3, retryDelay = 1000) {
  // Mock fetch function with random failures
  const mockFetch = asyncFn<HttpError>()(
    async (url: string, options: Record<string, unknown>): Promise<T> => {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Simulate random failures
      const random = Math.random();
      if (random < 0.2) {
        // Network failure
        const error = new RequestError(`Failed to connect to ${url}`);
        error.data.url = url;
        error.data.method = options.method?.toString() || 'GET';
        throw error;
      } else if (random < 0.4) {
        // Server error
        const error = new ResponseError(`Server error: ${url}`);
        error.data.statusCode = 503;
        error.data.retryable = true;
        throw error;
      } else if (random < 0.5) {
        // Timeout
        const error = new TimeoutError(`Request timed out: ${url}`);
        error.data.timeoutMs = 3000;
        throw error;
      }
      
      // Success case - mock response
      return { data: "Sample response", status: 200 } as unknown as T;
    }
  );
  
  // Helper function to retry a request
  const doRetry = async (attemptsLeft: number, delay: number): Promise<ReturnType<typeof ChainableResult.success<T>> | ReturnType<typeof ChainableResult.fromError>> => {
    console.log(`Retrying request to ${url}, attempts left: ${attemptsLeft - 1}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return executeRequest(attemptsLeft - 1);
  };
  
  // Execute the request with retry logic
  const executeRequest = async (attemptsLeft: number): Promise<ReturnType<typeof ChainableResult.success<T>> | ReturnType<typeof ChainableResult.fromError>> => {
    if (attemptsLeft <= 0) {
      return ChainableResult.fromError(new Error(`Max retries exceeded for ${url}`));
    }
    
    try {
      const data = await mockFetch.fn(url, options);
      return ChainableResult.success(data);
    } catch (error) {
      let shouldRetry = false;
      const typedError = error as HttpError;
      
      if (isErrorType(typedError, ResponseError) && typedError.data.retryable) {
        shouldRetry = true;
      } else if (isErrorType(typedError, RequestError)) {
        shouldRetry = true;
      } else if (isErrorType(typedError, TimeoutError)) {
        shouldRetry = true;
      }
      
      if (shouldRetry && attemptsLeft > 1) {
        // Exponential backoff
        const backoffDelay = retryDelay * (Math.pow(2, maxRetries - attemptsLeft));
        return doRetry(attemptsLeft - 1, backoffDelay);
      }
      
      // No retry possible, return the error
      return ChainableResult.fromError(typedError);
    }
  };
  
  return executeRequest(maxRetries);
}

// Example 7: Form validation with multiple fields
function validateForm(formData: FormData) {
  // Email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Use ChainableResult to build our validation
  return ChainableResult.success(formData)
    .flatMap(data => {
      const errors: FormErrors = {};
      
      // Username validation
      if (!data.username || data.username.length < 3) {
        errors.username = "Username must be at least 3 characters";
      }
      
      // Email validation
      if (!data.email || !emailRegex.test(data.email)) {
        errors.email = "Please enter a valid email address";
      }
      
      // Password validation
      if (!data.password || data.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      } else if (!/[A-Z]/.test(data.password) || !/\d/.test(data.password)) {
        errors.password = "Password must contain at least one uppercase letter and one number";
      }
      
      // Confirm password
      if (data.password !== data.confirmPassword) {
        errors.confirmPassword = "Passwords don't match";
      }
      
      // Age validation (optional field)
      if (data.age !== undefined) {
        if (isNaN(data.age) || data.age < 18 || data.age > 120) {
          errors.age = "Age must be between 18 and 120";
        }
      }
      
      // If we have errors, return a ValidationError
      if (Object.keys(errors).length > 0) {
        const error = new FormValidationError("Form validation failed");
        error.data.fieldErrors = errors;
        return ChainableResult.fromError(error);
      }
      
      // No errors, continue with the valid form data
      return ChainableResult.success(data);
    })
    .map(validForm => {
      // Process the validated form data
      return {
        ...validForm,
        validated: true,
        timestamp: new Date()
      };
    });
}

// Example 8: Combining multiple async operations - Database transactions
// Mock database functions
const mockDb = {
  findUser: asyncFn<InstanceType<typeof DatabaseError>>()(
    async (userId: string): Promise<User> => {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (userId === "404") {
        const error = new DatabaseError("User not found");
        error.data.operation = "find";
        error.data.tableName = "users";
        throw error;
      }
      return { id: userId, name: `User ${userId}`, email: `user${userId}@example.com` };
    }
  ),
  
  findPosts: asyncFn<InstanceType<typeof DatabaseError>>()(
    async (userId: string): Promise<Post[]> => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (userId === "no-posts") {
        return [];
      }
      return [
        { id: "p1", title: "First Post", content: "Content 1", userId },
        { id: "p2", title: "Second Post", content: "Content 2", userId }
      ];
    }
  ),
  
  findComments: asyncFn<InstanceType<typeof DatabaseError>>()(
    async (postId: string): Promise<Comment[]> => {
      await new Promise(resolve => setTimeout(resolve, 75));
      return [
        { id: "c1", postId, text: "Great post!", userId: "user1" },
        { id: "c2", postId, text: "Thanks for sharing", userId: "user2" }
      ];
    }
  ),
  
  createPost: asyncFn<InstanceType<typeof DatabaseError>>()(
    async (post: Omit<Post, "id">): Promise<Post> => {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (post.title.includes("error")) {
        const error = new DatabaseError("Failed to create post");
        error.data.operation = "create";
        error.data.tableName = "posts";
        throw error;
      }
      return { ...post, id: `p${Date.now()}` };
    }
  )
};

// Function to fetch a user's profile with posts and comments
async function getUserProfile(userId: string) {
  // 1. Get the user
  const userResult = await ChainableResult.tryCatchAsync(mockDb.findUser, userId);
  
  // 2. Then get their posts (only if user exists)
  const postsResult = await userResult.flatMapAsync(async (user) => {
    const posts = await ChainableResult.tryCatchAsync(mockDb.findPosts, user.id);
    return posts.map(postList => ({
      user,
      posts: postList
    }));
  });
  
  // 3. Get comments for each post (in parallel)
  return postsResult.flatMapAsync(async ({ user, posts }) => {
    if (posts.length === 0) {
      return ChainableResult.success({
        user,
        posts: [],
        totalComments: 0
      });
    }
    
    // First fetch all comments in parallel
    const commentResults = await Promise.all(
      posts.map(post => 
        ChainableResult.tryCatchAsync(mockDb.findComments, post.id)
      )
    );
    
    // Convert raw results to tagged post+comments pairs
    const postCommentPairs = [];
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const commentResult = commentResults[i];
      
      if (commentResult.success) {
        postCommentPairs.push({
          post,
          comments: commentResult.data
        });
      } else {
        // Handle comment fetch failure
        console.error(`Failed to fetch comments for post ${post.id}`);
        postCommentPairs.push({
          post,
          comments: [] // Use empty comments as a fallback
        });
      }
    }
    
    // Calculate total comments
    const totalComments = postCommentPairs.reduce(
      (total, pair) => total + pair.comments.length,
      0
    );
    
    // Return the combined result
    return ChainableResult.success({
      user,
      posts: postCommentPairs,
      totalComments
    });
  });
}

// Example 9: Database transaction with rollback
async function createUserWithInitialPost(userData: Omit<User, "id">, postData: Omit<Post, "id" | "userId">) {
  // Mock transaction functions
  const mockTransaction = {
    begin: asyncFn<InstanceType<typeof TransactionError>>()(async () => {
      console.log("Beginning transaction...");
      return { transactionId: `tx-${Date.now()}` };
    }),
    
    createUser: asyncFn<InstanceType<typeof TransactionError>>()(async (userData: Omit<User, "id">) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (userData.email.includes("error")) {
        const error = new TransactionError("Failed to create user");
        error.data.step = "createUser";
        throw error;
      }
      return { ...userData, id: `u-${Date.now()}` };
    }),
    
    createPost: asyncFn<InstanceType<typeof TransactionError>>()(async (postData: Omit<Post, "id">) => {
      await new Promise(resolve => setTimeout(resolve, 120));
      if (postData.title.includes("error")) {
        const error = new TransactionError("Failed to create post");
        error.data.step = "createPost";
        throw error;
      }
      return { ...postData, id: `p-${Date.now()}` };
    }),
    
    commit: asyncFn<InstanceType<typeof TransactionError>>()(async (transactionId: string) => {
      console.log(`Committing transaction ${transactionId}...`);
      return { success: true, transactionId };
    }),
    
    rollback: asyncFn<InstanceType<typeof TransactionError>>()(async (transactionId: string) => {
      console.log(`Rolling back transaction ${transactionId}...`);
      return { success: true, transactionId };
    })
  };
  
  // Transaction state to track for potential rollback
  type TransactionState = {
    transactionId: string;
    error?: InstanceType<typeof TransactionError>;
    user?: User;
    post?: Post;
    rollbacked?: boolean;
    committed?: boolean;
  };
  
  let txState: TransactionState | null = null;
  
  try {
    // Begin the transaction
    const beginResult = await mockTransaction.begin.fn();
    txState = { transactionId: beginResult.transactionId };
    
    // Create user
    const user = await mockTransaction.createUser.fn(userData);
    txState.user = user;
    
    // Create post
    const postWithUserId = { ...postData, userId: user.id };
    const post = await mockTransaction.createPost.fn(postWithUserId);
    txState.post = post;
    
    // Commit the transaction
    await mockTransaction.commit.fn(txState.transactionId);
    txState.committed = true;
    
    // Return success result
    return ChainableResult.success({
      user: txState.user,
      post: txState.post,
      committed: true
    });
  } catch (error) {
    // Store error in transaction state
    if (error instanceof TransactionError) {
      // We need to explicitly cast to the expected error type
      txState!.error = error as InstanceType<typeof TransactionError>;
    }
    
    // Perform rollback if we have a transaction ID
    if (txState?.transactionId && !txState.committed) {
      try {
        await mockTransaction.rollback.fn(txState.transactionId);
        if (txState.error) {
          txState.error.data.rollbacked = true;
        }
        txState.rollbacked = true;
      } catch (rollbackError) {
        console.error("Failed to rollback transaction:", rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    
    // Return failure result
    return ChainableResult.fromError(
      txState?.error || new Error("Transaction failed")
    );
  }
}

// ========== EXAMPLE EXECUTION ==========

// Run Example 1
console.log("Example 1: Basic method chaining with parsing and validation");
console.log(parseAndValidateNumber("42")); // 84
console.log(parseAndValidateNumber("-10")); // 0 (fails validation)
console.log(parseAndValidateNumber("abc")); // 0 (fails parsing)

// Run Example 2
console.log("\nExample 2: Recovery and side effects");
const validInput = processUserInput("  hello  ");
const emptyInput = processUserInput("   ");
console.log("Valid input result:", validInput);
console.log("Empty input result:", emptyInput);

// Run Example 3
console.log("\nExample 3: Converting between standard and chainable Result types");
fetchAndProcessData().then((result) => {
  console.log("Fetch and process result:", result);
});

// Run Example 4
console.log("\nExample 4: MapperFn with advanced error typing");
usingMapperFunctions().then(() => {
  console.log("Mapper functions example complete");
});

// Run Example 5
console.log("\nExample 5: Async operations with proper chaining");
asyncOperationsExample().then(() => {
  console.log("Async operations example complete");
});

// Run Example 6
console.log("\nExample 6: API Request with Retries");
fetchWithRetry<{ data: string; status: number }>("https://api.example.com/data").then(result => {
  if (result.success) {
    console.log("API request succeeded:", result.data);
  } else {
    console.log("API request failed:", result.error.message);
  }
});

// Run Example 7
console.log("\nExample 7: Form Validation");
const validForm: FormData = {
  username: "johndoe",
  email: "john@example.com",
  password: "Password123",
  confirmPassword: "Password123",
  age: 30
};

const invalidForm: FormData = {
  username: "jo",
  email: "not-an-email",
  password: "password",
  confirmPassword: "different",
  age: 15
};

console.log("Valid form result:", validateForm(validForm).toResult());
console.log("Invalid form result:", validateForm(invalidForm).toResult());

// Run Example 8
console.log("\nExample 8: Combining Multiple Async Operations");
getUserProfile("123").then(result => {
  console.log("User profile successful:", result.success);
  if (result.success) {
    console.log(`User: ${result.data.user.name}`);
    console.log(`Posts: ${result.data.posts.length}`);
    console.log(`Total comments: ${result.data.totalComments}`);
  }
});

// Run Example 9
console.log("\nExample 9: Database Transaction with Rollback");
createUserWithInitialPost(
  { name: "New User", email: "newuser@example.com" },
  { title: "My First Post", content: "Hello world!" }
).then(result => {
  if (result.success) {
    console.log("Transaction successful:", result.data);
  } else {
    console.log("Transaction failed:", result.error.message);
    // Check if this is our custom error type with rollback data
    if (result.error.raw instanceof TransactionError) {
      console.log("Was rolled back:", result.error.raw.data.rollbacked);
    }
  }
});
