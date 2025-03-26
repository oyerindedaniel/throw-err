# Why Not Just Pass the Error Type to tryCatch?

You could write code like this:

```typescript
const result = await tryCatch<ReturnType, ErrorType>(someAsyncFunction());
```

Here, `tryCatch` takes the async function and explicitly specifies the return type (`ReturnType`) and error type (`ErrorType`). This works fine in isolation, but it has some downsides as your codebase grows or gets more complex.

## 1. Type Inference and Less Repetition
With the explicit approach, you need to specify the error type every time you call `tryCatch`. This can get repetitive and error-prone, especially if you’re calling the same function in multiple places. For example:

```typescript
const result1 = await tryCatch<string, NetworkError>(fetchData());
const result2 = await tryCatch<string, NetworkError>(fetchData());
const result3 = await tryCatch<string, NetworkError>(fetchData());
```

Now, compare that to using `asyncFn`:

```typescript
const wrappedFetch = asyncFn<NetworkError>()(fetchData);
const result1 = await tryCatch(wrappedFetch); // Error type inferred
const result2 = await tryCatch(wrappedFetch); // Error type inferred
const result3 = await tryCatch(wrappedFetch); // Error type inferred
```

With `asyncFn`, you define the error type once when wrapping the function, and `tryCatch` infers it automatically. This reduces clutter and eliminates the risk of mistyping the error type in one of the calls.

## 2. Centralized Error Type Definition
When you pass the error type explicitly to `tryCatch`, it’s defined at the call site. This means:
- You might accidentally specify the wrong error type.
- If the function’s possible errors change (e.g., it now throws a `DatabaseError` instead of a `NetworkError`), you have to update every `tryCatch` call.

With `asyncFn`, the error type is tied to the function itself:

```typescript
const wrappedFn = asyncFn<DatabaseError>()(someAsyncFunction);
```

Now, the error type is defined once, near the function, ensuring consistency across all uses. If the error type changes, you update it in one place, not scattered throughout your code.

## 3. Better Composability with Utilities
Async workflows often involve utilities like retry, timeout, or function composition. Without `asyncFn`, each utility would need its own way to handle error types, likely requiring you to pass them manually:

```typescript
const result = await retry<ReturnType, ErrorType>(someAsyncFunction(), 3);
```

With `asyncFn`, the error type is part of the wrapped function’s type, so utilities can propagate it naturally:

```typescript
const wrappedFn = asyncFn<ErrorType>()(someAsyncFunction);
const retriedFn = retry(wrappedFn, 3); // Error type is inferred
```

This makes it easier to build reusable, composable tools without repeating type annotations.

## 4. Cleaner, More Readable Code
Explicitly specifying types in `tryCatch` can make your code harder to read, especially in complex workflows with multiple async operations. With `asyncFn`, the error type is declared once, near the function, making the intent clearer and the call sites simpler:

```typescript
// Without asyncFn
const result = await tryCatch<string, NetworkError | ValidationError>(complexAsyncFn());

// With asyncFn
const wrappedFn = asyncFn<NetworkError | ValidationError>()(complexAsyncFn);
const result = await tryCatch(wrappedFn);
```

The wrapped version is less cluttered and easier to maintain.

## 5. Type Safety in Function Composition
When combining multiple async functions, tracking error types manually can be tedious. Without `asyncFn`, you’d need to union the error types yourself:

```typescript
const result = await tryCatch<string, Error1 | Error2>(compose(fn1, fn2)());
```

With `asyncFn`, a `compose` utility can handle this automatically:

```typescript
const wrappedFn1 = asyncFn<Error1>()(fn1);
const wrappedFn2 = asyncFn<Error2>()(fn2);
const composedFn = compose(wrappedFn1, wrappedFn2); // Error type is Error1 | Error2
const result = await tryCatch(composedFn);
```

This ensures type safety without forcing you to manually juggle error types.

## 6. Error Types as Part of the Function’s API
Explicitly passing error types to `tryCatch` puts the burden on the caller to know and specify them correctly. With `asyncFn`, the error type becomes part of the function’s signature, like its return type. This makes the function’s behavior more predictable and self-documenting.

