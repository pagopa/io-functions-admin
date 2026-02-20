# Azure Functions v3 → v4 Migration Guide

This guide covers all the code changes required to migrate an Azure Functions app in this monorepo from the deprecated v3 model to the v4 programming model using `wrapHandlerV4`.

> **Important**: Ignore pure formatting drifts (trailing commas, arrow-function style) — these are cosmetic and should not be the focus of the migration.

---

## 1. `package.json` Changes

### Remove Express/v3 dependencies

Remove the following packages:

| Package | Was in |
|---------|--------|
| `@azure/functions: ^3.5.0` | `devDependencies` |
| `@pagopa/express-azure-functions` | `dependencies` |
| `express` | `dependencies` |
| `winston` | `dependencies` |
| `winston-transport` | `dependencies` |
| `@types/express` | `devDependencies` |

### Add v4 dependencies

```json
{
  "dependencies": {
    "@azure/functions": "^4.0.0",
    "@pagopa/io-functions-commons": "^30.0.0"
  }
}
```

### Add `main` entry point field

In the top-level fields (alongside `name`, `version`, etc.), add:

```json
{
  "main": "dist/main.js"
}
```

---

## 2. `handler.ts` Changes

### 2a. Replace imports

**Remove:**
```typescript
import * as express from "express";
import { withRequestMiddlewares, wrapRequestHandler } from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import { Context } from "@azure/functions";
```

**Add:**
```typescript
import { wrapHandlerV4 } from "@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter";
import { InvocationContext } from "@azure/functions";
```

### 2b. Replace `Context` with `InvocationContext`

All occurrences of `Context` from `@azure/functions` in handler signatures and type annotations become `InvocationContext`.

```typescript
// BEFORE
type IMyHandler = (context: Context, arg1: Foo) => Promise<IResponse>;

// AFTER
type IMyHandler = (context: InvocationContext, arg1: Foo) => Promise<IResponse>;
```

### 2c. Replace logger calls

| v3 | v4 |
|----|-----|
| `context.log.error(...)` | `context.error(...)` |
| `context.log.warn(...)` | `context.warn(...)` |
| `context.log.verbose(...)` | `context.debug(...)` |
| `context.log.info(...)` | `context.log(...)` |
| `context.log(...)` | `context.log(...)` |

### 2d. Replace the exported handler factory — no middlewares

```typescript
// BEFORE
export const Info = (): express.RequestHandler => {
  const handler = InfoHandler(checkApplicationHealth());
  return wrapRequestHandler(handler);
};

// AFTER
export const Info = () => {
  const handler = InfoHandler(checkApplicationHealth());
  return wrapHandlerV4([], handler);
};
```

### 2e. Replace the exported handler factory — with middlewares

The `withRequestMiddlewares(...).wrapRequestHandler(...)` chain is replaced by a flat middlewares array passed to `wrapHandlerV4`.

When the handler has **named middleware results** (e.g., `ContextMiddleware` + body/header middleware), the v4 handler receives each middleware's output as a **single merged object** instead of positional parameters.

```typescript
// BEFORE
export const ValidateProfileEmail = (
  tableClient: TableClient,
  profileModel: ProfileModel,
  profileEmails: IProfileEmailReader
): express.RequestHandler => {
  const handler = ValidateProfileEmailHandler({ tableClient, profileModel, profileEmails });

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    ValidateProfileEmailBodyMiddleware
  );
  return wrapRequestHandler(
    middlewaresWrap((context, body) => handler(context, body.token))
  );
};

// AFTER
export const ValidateProfileEmail = (
  tableClient: TableClient,
  profileModel: ProfileModel,
  profileEmails: IProfileEmailReader,
) => {
  const handler = ValidateProfileEmailHandler({ tableClient, profileModel, profileEmails });

  const middlewares = [
    ContextMiddleware(),
    ValidateProfileEmailBodyMiddleware,
  ] as const;
  return wrapHandlerV4(middlewares, handler);
};
```

> Note the `as const` assertion on the middlewares array — it is required for TypeScript to infer the correct tuple type for `wrapHandlerV4`.

When middlewares are used without wrapping, the handler signature changes accordingly:

```typescript
// BEFORE — handler receives positional params from each middleware
type IGetTokenInfoHandler = (context: Context, token: TokenParam) => Promise<...>;

// AFTER — handler receives context + merged middleware results
type IGetTokenInfoHandler = (context: InvocationContext, token: TokenParam) => Promise<...>;
// (positional params remain if the middleware order matches 1:1 with handler params)
```

For the `ValidateProfileEmail` case where the body middleware returns an object containing a `token` field, the handler receives the full body object:

```typescript
// BEFORE
type IValidateProfileEmailHandler = (context: Context, body: PayloadType) => Promise<...>;

// AFTER  
type IValidateProfileEmailHandler = (context: InvocationContext, body: { token: TokenParam }) => Promise<...>;
// handler destructures: async (context, { token }) => { ... }
```

---

## 3. Create `src/main.ts`

Replace the per-function `index.ts` entry points with a single `src/main.ts` that:
1. Imports `app` from `@azure/functions`
2. Initialises all shared dependencies (clients, models, config)
3. Registers all HTTP functions via `app.http(...)`

```typescript
import { app } from "@azure/functions";
// ... import clients, models, config helpers

import { MyHandler, AnotherHandler } from "./MyFunction/handler";

// ---------------------------------------------------------------
// CONFIG SETUP
// ---------------------------------------------------------------
const config = getConfigOrThrow();

const myClient = new SomeClient({
  endpoint: config.SOME_ENDPOINT,
  key: config.SOME_KEY,
});

// ---------------------------------------------------------------
// MOUNT HANDLERS
// ---------------------------------------------------------------
app.http("MyFunction", {
  methods: ["GET"],
  authLevel: "function",
  route: "my-route",
  handler: MyHandler(myClient),
});

app.http("AnotherFunction", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "another-route",
  handler: AnotherHandler(),
});
```

Use the [main.ts template](../templates/main.ts.template) as a starting point and fill in the specific dependencies and handlers for the app.

### `app.http` `authLevel` mapping

| `function.json` `authLevel` | `app.http` `authLevel` |
|----------------------------|------------------------|
| `"function"` | `"function"` |
| `"anonymous"` | `"anonymous"` |
| `"admin"` | `"admin"` |

### HTTP methods

Methods in `function.json` are lowercase (`"get"`, `"post"`), but `app.http` accepts both cases. Use uppercase for clarity: `["GET"]`, `["POST"]`.

---

## 4. Delete Per-Function Files

For each function sub-directory (e.g., `Info/`, `ValidateProfileEmailV2/`):

1. **Delete `function.json`** — the v4 model does not use per-function `function.json` files.
2. **Delete `index.ts`** — the per-function entry point is no longer needed; all registrations live in `src/main.ts`.

---

## 5. Update Tests

### Replace `Context` mock with `InvocationContext`

```typescript
// BEFORE
import { Context } from "@azure/functions";
const context = { log: { error: vi.fn(), warn: vi.fn(), verbose: vi.fn() } } as unknown as Context;

// AFTER
import { InvocationContext } from "@azure/functions";
const context = new InvocationContext();
// or:
const context = {
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
} as unknown as InvocationContext;
```

### Replace log method mocks

| v3 mock | v4 mock |
|---------|---------|
| `context.log.error` | `context.error` |
| `context.log.warn` | `context.warn` |
| `context.log.verbose` | `context.debug` |

---

## 6. Update Custom Middlewares

Replace manually written Express-style middlewares with typed helpers from `@pagopa/io-functions-commons`:

### Header middleware

```typescript
// BEFORE
import { Request } from "express";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import { IResponse, ResponseErrorFromValidationErrors } from "@pagopa/ts-commons/lib/responses";

export const TokenHeaderParamMiddleware = async (
  request: Request
): Promise<E.Either<IResponse<"IResponseErrorValidation">, TokenParam>> =>
  pipe(
    request.headers[TOKEN_HEADER_NAME],
    TokenParam.decode,
    E.mapLeft(ResponseErrorFromValidationErrors(TokenParam))
  );

// AFTER
import { RequiredHeaderMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_header";

export const TokenHeaderParamMiddleware = RequiredHeaderMiddleware(
  TOKEN_HEADER_NAME,
  TokenParam,
);
```

### Body middleware

```typescript
// BEFORE
import { RequiredBodyPayloadMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_body_payload";
export const MyBodyMiddleware = RequiredBodyPayloadMiddleware(MyPayloadType);
// (this one is already compatible — no change needed)
```

---

## Summary Checklist

- [ ] `package.json`: add `"main": "dist/main.js"`, upgrade `@azure/functions` to `^4.0.0`, update `@pagopa/io-functions-commons` to `^30.0.0`, remove Express/winston deps
- [ ] Each `handler.ts`: replace `wrapRequestHandler` / `withRequestMiddlewares` with `wrapHandlerV4`, replace `Context` with `InvocationContext`, update logger calls
- [ ] Create `src/main.ts` with all HTTP registrations
- [ ] Delete all per-function `function.json` files
- [ ] Delete all per-function `index.ts` entry points
- [ ] Update tests: replace `Context` mocks, update log spy references
- [ ] Update custom middlewares to use `RequiredHeaderMiddleware` / `RequiredBodyPayloadMiddleware` where applicable
