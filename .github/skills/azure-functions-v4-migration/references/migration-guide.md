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

### Upgrade Durable Functions (if applicable)

If the app uses Durable Functions (orchestrators/activities), upgrade:

```json
{
  "dependencies": {
    "durable-functions": "^3.0.0"
  }
}
```

Remove the old `durable-functions: ^1.x` from `dependencies`.

### Upgrade handler-kit (if applicable)

If the app uses `@pagopa/handler-kit-azure-func` for queue functions, upgrade:

```json
{
  "dependencies": {
    "@pagopa/handler-kit": "^1.1.1",
    "@pagopa/handler-kit-azure-func": "^2.0.8"
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

### Parameter name alignment between route/request and middlewares

Every middleware that reads a value from the request does so by indexing into a specific part of the request object using the `name` string you pass as the first argument. **The `name` must exactly match the identifier the runtime uses to populate that part of the request** — a mismatch is silently swallowed (validation always fails or returns `O.none`) with no runtime error or warning.

| Middleware | Reads from | `name` must exactly match |
|---|---|---|
| `RequiredParamMiddleware(name, type)` | `request.params[name]` | Route placeholder `{name}` in `app.http` `route` |
| `OptionalParamMiddleware(name, type)` | `request.params[name]` | Route placeholder `{name}` in `app.http` `route` |
| `RequiredQueryParamMiddleware(name, type)` | `request.query[name]` | Query-string key `?name=…` |
| `OptionalQueryParamMiddleware(name, type)` | `request.query[name]` | Query-string key `?name=…` |
| `RequiredHeaderMiddleware(name, type)` | `request.headers[name]` | HTTP header name — **lowercase** (Azure Functions v4 normalises all incoming header names to lowercase in `request.headers`) |

#### Path parameters

```typescript
// WRONG — middleware reads request.params["serviceId"] but the route populates "service_id"
app.http("GetService", {
  route: "v1/services/{service_id}",   // ❌  populates request.params["service_id"]
  ...
});
const middlewares = [
  RequiredParamMiddleware("serviceId", NonEmptyString),  // ❌  looks for "serviceId" → always undefined
] as const;

// CORRECT — the name passed to the middleware is identical to the route placeholder
app.http("GetService", {
  route: "v1/services/{service_id}",   // ✅
  ...
});
const middlewares = [
  RequiredParamMiddleware("service_id", NonEmptyString),  // ✅
] as const;
```

#### Query parameters

```typescript
// WRONG — middleware looks for "pageCursor" but the client sends ?page_cursor=…
const middlewares = [
  OptionalQueryParamMiddleware("pageCursor", NonEmptyString),   // ❌  always O.none
] as const;

// CORRECT
const middlewares = [
  OptionalQueryParamMiddleware("page_cursor", NonEmptyString),  // ✅
] as const;
```

#### Headers

Azure Functions v4 normalises all incoming HTTP header names to **lowercase** before populating `request.headers`. Always use lowercase for the `name` argument.

```typescript
// WRONG — "X-Subscription-Id" is never found because request.headers uses lowercase keys
const middlewares = [
  RequiredHeaderMiddleware("X-Subscription-Id", NonEmptyString),  // ❌
] as const;

// CORRECT
const middlewares = [
  RequiredHeaderMiddleware("x-subscription-id", NonEmptyString),  // ✅
] as const;
```

#### Special case: hard-coded fiscal code middlewares

The following middlewares hard-code the param key they read from `request.params` — the key is not visible at the call site:

| Middleware | Hard-coded param key |
|---|---|
| `SandboxFiscalCodeMiddleware` | `"fiscalcode"` (all lowercase) |
| `FiscalCodeMiddleware` | `"fiscalcode"` (all lowercase) |
| `OptionalFiscalCodeMiddleware` | `"fiscalcode"` (all lowercase) |

This is a specific application of the general rule above. When any of these middlewares is used, the `route` in `app.http()` **must** contain `{fiscalcode}` (all lowercase), regardless of the casing used in the old `function.json` binding or the old express route in `index.ts`.

```typescript
// WRONG — camelCase {fiscalCode} does not match the hard-coded "fiscalcode" key
app.http("CreateDevelopmentProfile", {
  route: "adm/development-profiles/{fiscalCode}",   // ❌
  ...
});

// CORRECT — lowercase {fiscalcode} matches what the middleware reads
app.http("CreateDevelopmentProfile", {
  route: "adm/development-profiles/{fiscalcode}",   // ✅
  ...
});
```

**Double-check procedure:** before writing the `route` string, inspect both sources in the old v3 code:

1. **`function.json`** — look at the `route` binding (e.g. `"adm/development-profiles/{fiscalcode}"`). This tells you the URL shape but may use a different casing than what the middleware expects.
2. **`index.ts`** express route — look at the `app.get/post/...` call (e.g. `app.post("/adm/development-profiles/:fiscalcode", ...)`). The param name after `:` in the express route is what `req.params` will contain, and therefore what the middleware reads.

If the two sources disagree on casing, **the express route in `index.ts` is authoritative** because it determines what ends up in `req.params`. When migrating to v4, use that same casing (which for all fiscal-code middlewares is `fiscalcode` — all lowercase).

---

## 4. Retry Policy Migration

Before deleting `function.json` files (next step), scan them for `retry` configurations. Retry policies must be migrated differently depending on the trigger type:

- **Binding-level retry** (Queue Storage, Blob Storage): migrate to `host.json` `extensions` section
- **Runtime retry policies** (CosmosDB, Event Hubs, Kafka, Timer): migrate to per-function `retry` option in code registrations

> **Reference**: [Azure Functions error handling and retries](https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-error-pages?tabs=fixed-delay%2Cisolated-process%2Cnode-v4%2Cpython-v2&pivots=programming-language-typescript#retries)

### 4a. Discovery — scan `function.json` files for retry configs

Scan all `function.json` files in the project for the `"retry"` property. Group any retry configurations found by trigger type:

```bash
# Find all function.json files with retry configs
grep -rl '"retry"' */function.json
```

Classify each retry config by its trigger type:

| Trigger type | Retry mechanism | Migration target |
|-------------|----------------|-----------------|
| `queueTrigger` | Binding-level (built-in) | `host.json` → `extensions.queues` |
| `blobTrigger` | Binding-level (built-in) | `host.json` → `extensions.blobs` |
| `cosmosDBTrigger` | Runtime retry policy | `app.cosmosDB()` → `retry` option |
| `timerTrigger` | Runtime retry policy | `app.timer()` → `retry` option |
| `eventHubTrigger` | Runtime retry policy | `app.eventHub()` → `retry` option |
| `kafkaTrigger` | Runtime retry policy | `app.kafka()` → `retry` option |

### 4b. Queue triggers — migrate to `host.json` `extensions.queues`

Queue triggers do **not** support runtime retry policies in GA. Instead, the built-in dequeue retry mechanism is configured in `host.json`.

> **⚠️ Known limitation**: The built-in queue retry uses a **fixed** `visibilityTimeout` (not exponential backoff). If the original `function.json` uses `exponentialBackoff`, this is a behavioral difference that must be documented.

**BEFORE** — `function.json` with exponential backoff retry:
```json
{
  "bindings": [
    {
      "name": "queueItem",
      "type": "queueTrigger",
      "direction": "in",
      "queueName": "my-queue",
      "connection": "MyStorageConnection"
    }
  ],
  "retry": {
    "strategy": "exponentialBackoff",
    "maxRetryCount": 5,
    "minimumInterval": "00:00:30",
    "maximumInterval": "00:05:00"
  }
}
```

**AFTER** — `host.json` with `extensions.queues` (remove `retry` from function registration):

The agent MUST compute `maxDequeueCount` to approximate the same total retry window as the original exponential backoff:

1. Calculate the total time covered by exponential backoff: sum of all intervals across `maxRetryCount` attempts, where each interval is `min(minimumInterval × 2^(attempt-1), maximumInterval)`
2. Choose `visibilityTimeout` equal to `minimumInterval` (first backoff step)
3. Compute `maxDequeueCount` = ceil(totalExponentialTime / visibilityTimeout)

**Example calculation** (maxRetryCount=5, minimumInterval=30s, maximumInterval=300s):
- Intervals: 30, 60, 120, 240, 300 → total ≈ 750s
- visibilityTimeout = "00:00:30" (= minimumInterval)
- maxDequeueCount = ceil(750 / 30) = 25

```json
// host.json — AFTER
{
  "version": "2.0",
  "extensions": {
    "queues": {
      // Migrated from function.json exponentialBackoff retry:
      //   maxRetryCount=5, minimumInterval=00:00:30, maximumInterval=00:05:00
      //   Exponential intervals: 30s, 60s, 120s, 240s, 300s → total=750s
      //   visibilityTimeout=30s → maxDequeueCount=ceil(750/30)=25
      "maxDequeueCount": 25,
      "visibilityTimeout": "00:00:30"
    }
  }
}
```

**In `main.ts`** — do NOT add a `retry` option to `app.storageQueue()`:

```typescript
// Queue triggers do NOT support runtime retry policies in GA
app.storageQueue("MyQueueFunction", {
  connection: "MyStorageConnection",
  queueName: "my-queue",
  // NO `retry` option here — use host.json extensions.queues instead
  handler: myHandler,
});
```

### 4c. CosmosDB triggers — per-function `retry` option

CosmosDB triggers support runtime retry policies. The `retry` block from `function.json` moves to the `retry` property in `app.cosmosDB()` registration.

**BEFORE** — `function.json`:
```json
{
  "bindings": [
    {
      "type": "cosmosDBTrigger",
      "name": "documents",
      "direction": "in",
      "databaseName": "my-db",
      "containerName": "my-container",
      "connection": "CosmosDBConnection",
      "leaseContainerName": "leases",
      "createLeaseContainerIfNotExists": true
    }
  ],
  "retry": {
    "strategy": "exponentialBackoff",
    "maxRetryCount": -1,
    "minimumInterval": "00:00:05",
    "maximumInterval": "00:30:00"
  }
}
```

**AFTER** — `app.cosmosDB()` in `main.ts`:
```typescript
app.cosmosDB("MyCosmosFunction", {
  connection: "CosmosDBConnection",
  databaseName: "my-db",
  containerName: "my-container",
  leaseContainerName: "leases",
  createLeaseContainerIfNotExists: true,
  retry: {
    strategy: "exponentialBackoff",
    maxRetryCount: -1,
    minimumInterval: { seconds: 5 },
    maximumInterval: { minutes: 30 },
  },
  handler: myHandler,
});
```

> **Note**: The interval format changes from v3 `"HH:mm:ss"` strings to v4 `{ seconds: N }` / `{ minutes: N }` objects. Convert carefully:
> - `"00:00:05"` → `{ seconds: 5 }`
> - `"00:05:00"` → `{ minutes: 5 }`
> - `"00:30:00"` → `{ minutes: 30 }`
> - `"01:00:00"` → `{ hours: 1 }`

### 4d. Uniformity check — prompt user when configs differ within the same trigger type

After grouping all retry configs by trigger type:

- **Queue triggers**: If all queue triggers share the same retry config → apply a single `extensions.queues` config in `host.json`. If they differ → list all distinct configs and **ask the user** to pick one global value or enter a custom one (since `host.json` applies to all queue triggers globally).
- **CosmosDB triggers** (and other per-function retry types): Each function registration receives its own `retry` option independently. Do NOT unify or prompt the user — use the retry config from each function's `function.json` as-is.
- **Do NOT** try to unify across different trigger types (queue vs CosmosDB) — they use different mechanisms by design.

### 4e. Functions with no retry policy

Functions that do **not** have a `retry` block in their `function.json` should **not** have retry added during migration. Preserve the existing behavior — do not introduce retry where none existed before.

---

## 5. Delete Per-Function Files

For each function sub-directory (e.g., `Info/`, `ValidateProfileEmailV2/`):

1. **Delete `function.json`** — the v4 model does not use per-function `function.json` files.
2. **Delete `index.ts`** — the per-function entry point is no longer needed; all registrations live in `src/main.ts`.

---

## 6. Update Tests

Unit tests need updates in three areas: the mock context shape, the handler call parameter order, and the durable-functions mock API.

---

### 6a. Replace the mock `Context` with `InvocationContext`

Any test that creates an inline mock context must switch from the v3 nested-log shape to the v4 flat shape.

```typescript
// BEFORE (v3)
import { Context } from "@azure/functions";
const context = {
  log: {
    error: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  },
} as unknown as Context;

// AFTER (v4)
import { InvocationContext } from "@azure/functions";
const context = {
  debug: vi.fn().mockImplementation(console.log),
  error: vi.fn().mockImplementation(console.error),
  log:   vi.fn().mockImplementation(console.log),
  warn:  vi.fn().mockImplementation(console.warn),
} as unknown as InvocationContext;
```

**Prefer** importing from the shared mock file instead of creating a local one:

```typescript
// eslint-disable-next-line vitest/no-mocks-import
import { context as contextMock } from "../../__mocks__/functions";
// or for Durable Functions tests:
import { context as contextMock } from "../../__mocks__/durable-functions";
```

### Log method reference table

In assertions or anywhere a specific logger method is referenced:

| v3 | v4 |
|----|----|
| `context.log.error` | `context.error` |
| `context.log.warn` | `context.warn` |
| `context.log.verbose` | `context.debug` |
| `context.log.info` | `context.log` |

---

### 6b. Swap activity / trigger handler parameter order

In v4, **all non-HTTP handlers** receive `(input, context)` — data first, context second. Tests that called `handler(context, input)` must be updated to `handler(input, context)`.

#### Activity functions

```typescript
// BEFORE (v3)
const result = await handler(contextMock, input);

// AFTER (v4)
const result = await handler(input, contextMock);
```

This applies to every activity handler (`createXxxActivityHandler`, `getActivityFunction`, etc.) regardless of how the factory is named.

#### CosmosDB trigger functions

```typescript
// BEFORE (v3 CosmosDB trigger)
await handler(context, documents);

// AFTER (v4 CosmosDB trigger)
await handler(documents, context);
```

#### Queue trigger functions

```typescript
// BEFORE (v3 queue trigger)
await handler(context, queueMessage);

// AFTER (v4 queue trigger)
await handler(queueMessage, context);
```

#### Additional arguments (e.g. `updateSubscriptionFeed`)

When a handler takes extra service arguments after context, only swap the first two:

```typescript
// BEFORE
updateSubscriptionFeed(contextMock as unknown as Context, input, tableService, tableName);

// AFTER — also update the type import from Context to InvocationContext
import { InvocationContext } from "@azure/functions";
updateSubscriptionFeed(input, contextMock as unknown as InvocationContext, tableService, tableName);
```

---

### 6c. Update durable-functions mocks

#### `startNew` signature (v1 → v3)

The `startNew` call changed from positional arguments to an options object.

```typescript
// BEFORE — v1 mock signature
vi.mock("durable-functions", () => ({
  getClient: (_context: unknown) => ({
    startNew: async (
      _orchestratorName: string,
      orchestratorId: string,        // ← second positional arg
      _orchestratorInput: unknown
    ) => orchestratorId,
  }),
}));

// AFTER — v3 mock signature
vi.mock("durable-functions", () => ({
  getClient: (_context: unknown) => ({
    startNew: async (
      _orchestratorName: string,
      options: { input?: unknown; instanceId?: string }  // ← options object
    ) => options.instanceId ?? "",
  }),
}));
```

#### `DurableOrchestrationStatus` import path

```typescript
// BEFORE (v1 internal path — no longer valid)
import { DurableOrchestrationStatus } from "durable-functions/lib/src/durableorchestrationstatus";

// AFTER (v3)
import { DurableOrchestrationStatus } from "durable-functions/types/orchestration";
```

#### `__mocks__/durable-functions.ts` module mock

The shared mock file must export the v3 API shape. Key differences from v1:

- Remove `orchestrator` export (removed in v3).
- Add `input.durableClient` export (used by CosmosDB/queue triggers that carry the durable client).
- Add `app.activity` / `app.orchestration` stubs (invoked during `main.ts` registration).
- Update `mockStartNew` to `(name, options?)` where options is `{ instanceId?, input? }`.

```typescript
// __mocks__/durable-functions.ts (v4-compatible excerpts)
export const mockStartNew = vi.fn(
  (_name: string, _options?: { instanceId?: string; input?: unknown }) =>
    Promise.resolve("instanceId")
);

export const input = {
  durableClient: vi.fn().mockReturnValue({})
};

export const app = {
  activity: vi.fn(),
  orchestration: vi.fn()
};
```

---

## 7. Update Custom Middlewares

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

---

## 8. Durable Functions Migration (`durable-functions` v1 → v3)

The `durable-functions` package v3 is required for programming model v4. This affects both orchestrators and activities.

### 8a. Package upgrade

See [package.json changes](#upgrade-durable-functions-if-applicable).

### 8b. Replace Durable Functions imports

**Remove:**
```typescript
import { IOrchestrationFunctionContext, RetryOptions, Task, TaskSet } from "durable-functions/lib/src/classes";
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import { DurableOrchestrationClient } from "durable-functions/lib/src/durableorchestrationclient";
import { DurableOrchestrationClient } from "durable-functions/lib/src/classes";
```

**Add:**
```typescript
import { OrchestrationContext, RetryOptions, Task } from "durable-functions";
import * as df from "durable-functions";
// DurableOrchestrationClient → df.DurableClient (accessed via df.getClient(context))
```

### 8c. Replace orchestrator context type

All occurrences of `IOrchestrationFunctionContext` become `OrchestrationContext`:

```typescript
// BEFORE
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
function* handler(context: IOrchestrationFunctionContext): Generator<Task> { ... }

// AFTER
import { OrchestrationContext } from "durable-functions";
function* handler(context: OrchestrationContext): Generator<Task> { ... }
```

### 8d. Replace `df.orchestrator()` wrapper

In v3, orchestrators are no longer wrapped with `df.orchestrator()`. The generator function is passed directly to `df.app.orchestration()` in `main.ts`.

```typescript
// BEFORE (index.ts) — DELETED
import * as df from "durable-functions";
const orchestrator = df.orchestrator(handler);
export default orchestrator;

// AFTER (main.ts)
df.app.orchestration("MyOrchestrator", handler);
```

### 8e. Replace `client.startNew()` API

The `startNew` call signature changed in durable-functions v3:

```typescript
// BEFORE
await client.startNew("OrchestratorName", undefined, { message: data });

// AFTER
await client.startNew("OrchestratorName", { input: { message: data } });
```

### 8f. Orchestrator replay-safe logging

In v3, orchestrator context exposes `context.df.isReplaying`. Guard log calls to avoid duplicate logs during replays:

```typescript
// BEFORE
context.log.info(`${logPrefix}|${message}`);
context.log.error(`${logPrefix}|${error}`);
context.log.verbose(`${logPrefix}|${detail}`);

// AFTER
if (!context.df.isReplaying) {
  context.log(`${logPrefix}|${message}`);
}
if (!context.df.isReplaying) {
  context.error(`${logPrefix}|${error}`);
}
if (!context.df.isReplaying) {
  context.trace(`${logPrefix}|${detail}`);
}
```

> **Note**: `context.log.verbose()` becomes `context.trace()` in the v4 orchestrator context.

### 8g. Register activities in `main.ts`

Activities are registered via `df.app.activity()` instead of per-function `function.json`.

**Activity handler signature change** — parameters are swapped in v3:

```typescript
// BEFORE — (context, input)
export const handler = async (context: Context, input: unknown): Promise<ActivityResult> => { ... };

// AFTER — (input, context)
export const handler = async (input: unknown, context: InvocationContext): Promise<ActivityResult> => { ... };
```

**Export an `ActivityName` constant** from each activity handler module:

```typescript
// handler.ts
export const ActivityName = "GetProfileActivity";
```

**Registration in `main.ts`:**

```typescript
import * as df from "durable-functions";
import { ActivityName, getActivityHandler } from "./GetProfileActivity/handler";

df.app.activity(ActivityName, {
  handler: getActivityHandler(profileModel),
});
```

### 8h. Register orchestrators in `main.ts`

Orchestrators are registered via `df.app.orchestration()`. The generator function is passed directly — no `df.orchestrator()` wrapper.

**Export an `OrchestratorName` constant** from each orchestrator handler module:

```typescript
// handler.ts
export const OrchestratorName = "UserDataDeleteOrchestratorV2";

export const getHandler = (deps: Dependencies) =>
  function* (context: OrchestrationContext): Generator<Task> { ... };
```

**Registration in `main.ts`:**

```typescript
df.app.orchestration(
  "UserDataDeleteOrchestratorV2",
  getHandler({ waitInterval, isUserEligibleForInstantDelete: ... }),
);
```

### 8i. Delete per-function files for activities and orchestrators

For each activity/orchestrator directory:
1. **Delete `function.json`** (was `{ bindings: [{ type: "activityTrigger" }] }` or `{ bindings: [{ type: "orchestrationTrigger" }] }`)
2. **Delete `index.ts`** (was either `export default handler` or `export default df.orchestrator(handler)`)

### 8j. Update Durable Functions test mocks

When updating unit tests for orchestrators (e.g., in `__tests__/handler.test.ts`), you must update the context type and its import path.

```typescript
// BEFORE
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/classes";
// or
import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";

const contextMock = {
  df: { callActivity: mockCallActivity, getInput: mockGetInput },
} as unknown as IOrchestrationFunctionContext;
// or, if you import from the shared mock file:
const contextMock = mockOrchestratorContext as unknown as IOrchestrationFunctionContext;

// AFTER
import { OrchestrationContext } from "durable-functions";
const contextMock = {
  df: { callActivity: mockCallActivity, getInput: mockGetInput },
} as unknown as OrchestrationContext;
// or, if you import from the shared mock file:
const context = mockOrchestratorContext as unknown as OrchestrationContext;
```

For the `durable-functions` mock module (`__mocks__/durable-functions.ts`):

```typescript
// BEFORE
export const orchestrator = vi.fn();
export const context = {
  log: { error: vi.fn(), info: vi.fn(), verbose: vi.fn(), warn: vi.fn() },
} as unknown as Context;

// AFTER
export const app = {
  activity: vi.fn(),
  orchestration: vi.fn(),
};
export const input = {
  durableClient: vi.fn(() => ({})),
};
export const context = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
} as unknown as InvocationContext;
```

For activity handler tests, swap parameter order:

```typescript
// BEFORE
const res = await handler(contextMock, input);

// AFTER
const res = await handler(input, contextMock);

---

### 8k. Handle `durable-functions` v3 behavioral breaking changes

Beyond signature changes, `durable-functions` v3 introduces **behavioral breaking changes** in `DurableClient` methods. These are silent regressions that won't cause compile-time errors but will change runtime behavior.

#### `getStatus()` throws on HTTP 404 (instance not found)

This is the **most critical** behavioral change.

| Behavior | v1/v2 | v3 |
|----------|-------|-----|
| Instance not found (404) | Returns `response.data as DurableOrchestrationStatus` (may be empty/partial) | **Throws `Error`** with message containing `"HTTP 404"` |
| Valid response (200/202) | Returns raw `response.data` cast | Wraps in `new DurableOrchestrationStatus(response.data)` — validates required fields via constructor |
| Empty response body | Returns whatever `response.data` is | **Throws `Error`** (`"empty HTTP ... response"`) |

**Impact**: Any code that calls `getStatus()` and expects it to silently return on not-found will now crash.

**Pattern — wrapping `getStatus` in `TE.tryCatch`:**

If your code wraps `getStatus()` in `TE.tryCatch` and maps all errors uniformly, you must now distinguish 404 errors from other failures:

```typescript
// BEFORE — all errors treated the same (v1/v2: 404 never reached here)
TE.tryCatch(
  () => client.getStatus(instanceId),
  () => ({ kind: "NOT_FOUND_FAILURE" })
)

// AFTER — distinguish 404 from unexpected errors
import { isInstanceNotFoundError } from "../utils/orchestrator";

TE.tryCatch(
  () => client.getStatus(instanceId),
  (err): FailureResult =>
    isInstanceNotFoundError(E.toError(err))
      ? { kind: "NOT_FOUND_FAILURE" }
      : { kind: "UNHANDLED", reason: E.toError(err).message }
)
```

**Pattern — 404 as "orchestrator not running":**

Utility functions that call `getStatus()` to check if an orchestrator exists should treat 404 as "not found / not running" rather than propagating the error:

```typescript
// utils/orchestrator.ts
import * as df from "durable-functions";
import { DurableOrchestrationStatus } from "durable-functions";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

export const isInstanceNotFoundError = (error: Error): boolean =>
  error.message?.includes("HTTP 404");

export const isOrchestratorRunning = (
  client: df.DurableClient,
  orchestratorId: string
): TE.TaskEither<
  Error,
  DurableOrchestrationStatus & { readonly isRunning: boolean }
> =>
  pipe(
    TE.tryCatch(() => client.getStatus(orchestratorId), toError),
    TE.map(status => ({
      ...status,
      isRunning:
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Running ||
        status.runtimeStatus === df.OrchestrationRuntimeStatus.Pending
    })),
    // durable-functions v3: getStatus throws on 404 (instance not found).
    // Treat as "not running" to preserve v2 semantic behaviour.
    TE.orElse(error =>
      isInstanceNotFoundError(error)
        ? TE.of({
            createdTime: new Date(0),
            instanceId: orchestratorId,
            lastUpdatedTime: new Date(0),
            name: orchestratorId,
            runtimeStatus:
              "Unknown" as unknown as df.OrchestrationRuntimeStatus,
            input: null,
            output: null,
            isRunning: false as const
          } as DurableOrchestrationStatus & { readonly isRunning: false })
        : TE.left(error)
    )
  );
```

#### `DurableOrchestrationStatus` constructor validation (v3)

In v3, `getStatus()` wraps the response in `new DurableOrchestrationStatus(data)` which validates required fields (`name`, `instanceId`, `createdTime`, `lastUpdatedTime`, `runtimeStatus`). If the Durable Task extension returns malformed data, this constructor throws a `TypeError`. This won't contain `"HTTP 404"` in the message, so `isInstanceNotFoundError` correctly returns `false` — the error will propagate as an unexpected failure.

#### Other method changes (reference)

| Method | v1/v2 | v3 | Used in codebase? |
|--------|-------|-----|-------------------|
| `raiseEvent()` on 404 | Rejects with `"No instance with ID '...' found."` | Same behavior | Yes |
| `terminate()` on 404 | Rejects with `"No instance with ID '...' found."` | Same behavior | No (only mocked) |
| `rewind()` on 410 | `"The rewind operation is only supported..."` | Uses HTTP 412 instead of 410; adds 501 for unsupported storage | No |
| `startNew()` signature | `(name, instanceId?, input?)` | `(name, options?: { instanceId?, input?, version? })` | Yes — already migrated |
| `raiseEvent()` signature | `(id, name, data, taskHub?, conn?)` | `(id, name, data, options?: TaskHubOptions)` | Yes — no optional params used |
| New: `suspend()` / `resume()` | N/A | Available | No |

#### Updating mocks for v3 behavior

The shared mock file should expose a helper to simulate the v3 404 error:

```typescript
// __mocks__/durable-functions.ts
export const makeGetStatus404Error = (instanceId: string): Error =>
  new Error(
    `DurableClient error: Durable Functions extension replied with HTTP 404 response. ` +
      `This usually means we could not find any data associated with the instanceId provided: ${instanceId}.`
  );
```

Mock `getStatus` responses should include all required `DurableOrchestrationStatus` fields:

```typescript
export const mockStatusCompleted = {
  createdTime: new Date(),
  instanceId: "orchestratorId",
  lastUpdatedTime: new Date(),
  name: "orchestratorId",
  input: null,
  output: null,
  runtimeStatus: OrchestrationRuntimeStatus.Completed
};
```

To test the 404 scenario:

```typescript
mockGetStatus.mockRejectedValue(makeGetStatus404Error("my-instance-id"));
```

---

## 9. Queue Triggers

Queue triggers in `function.json` become `app.storageQueue()` registrations in `main.ts`.

### 9a. Basic queue trigger

```json
// BEFORE — function.json
{
  "bindings": [
    {
      "type": "queueTrigger",
      "direction": "in",
      "name": "queueItem",
      "queueName": "%MY_QUEUE_NAME%",
      "connection": "MyStorageConnection"
    }
  ]
}
```

```typescript
// AFTER — main.ts
app.storageQueue("MyQueueFunction", {
  connection: "MyStorageConnection",
  queueName: "%MY_QUEUE_NAME%",
  handler: myQueueHandler,
});
```

Handler signature:

```typescript
// BEFORE
export default async (context: Context, queueItem: unknown): Promise<void> => { ... };

// AFTER
const myQueueHandler = async (queueItem: unknown, context: InvocationContext): Promise<void> => { ... };
```

> **Note**: Like activities, parameter order is swapped — `(queueItem, context)` instead of `(context, queueItem)`.

### 9b. Queue trigger with durable client

When a queue trigger needs to start orchestrators, add `df.input.durableClient()` as extra input:

```typescript
import * as df from "durable-functions";

app.storageQueue("HandleNHNotificationCall", {
  connection: "NOTIFICATIONS_STORAGE_CONNECTION_STRING",
  queueName: "%NOTIFICATIONS_QUEUE_NAME%",
  extraInputs: [df.input.durableClient()],
  handler: getNotificationCallHandler(),
});
```

Inside the handler, obtain the durable client:

```typescript
// BEFORE — v3
const client: DurableOrchestrationClient = df.getClient(context);

// AFTER — v4 (same API, but context is InvocationContext)
const client = df.getClient(context);
```

### 9c. Queue trigger with output bindings

When a queue trigger writes to an output queue:

```typescript
import { app, output } from "@azure/functions";

const notifyQueueOutput = output.storageQueue({
  connection: "NOTIFICATIONS_STORAGE_CONNECTION_STRING",
  queueName: "%NOTIFY_MESSAGE_QUEUE_NAME%",
});

app.storageQueue("HandleNHNotificationCall", {
  connection: "NOTIFICATIONS_STORAGE_CONNECTION_STRING",
  queueName: "%NOTIFICATIONS_QUEUE_NAME%",
  extraInputs: [df.input.durableClient()],
  extraOutputs: [notifyQueueOutput],
  handler: getNotificationCallHandler(notifyQueueOutput),
});
```

In the handler, replace `context.bindings.X = value` with `context.extraOutputs.set()`:

```typescript
// BEFORE
context.bindings.notifyMessages = encodedMessage;

// AFTER
context.extraOutputs.set(notifyQueueOutput, encodedMessage);
```

---

## 10. CosmosDB Trigger (Change Feed)

CosmosDB change feed triggers in `function.json` become `app.cosmosDB()` registrations in `main.ts`.

### 10a. Basic CosmosDB trigger

```json
// BEFORE — function.json
{
  "bindings": [
    {
      "type": "cosmosDBTrigger",
      "name": "documents",
      "direction": "in",
      "leaseContainerName": "change-feed-leases",
      "leaseContainerPrefix": "userDataProcessing",
      "connection": "COSMOSDB_CONNECTION_STRING",
      "databaseName": "%COSMOSDB_NAME%",
      "containerName": "user-data-processing",
      "createLeaseContainerIfNotExists": true
    },
    {
      "name": "starter",
      "type": "orchestrationClient",
      "direction": "in"
    }
  ]
}
```

```typescript
// AFTER — main.ts
import * as df from "durable-functions";

app.cosmosDB("UserDataProcessingTrigger", {
  connection: "COSMOSDB_CONNECTION_STRING",
  databaseName: "%COSMOSDB_NAME%",
  containerName: "user-data-processing",
  leaseContainerName: "change-feed-leases",
  leaseContainerPrefix: "userDataProcessing",
  createLeaseContainerIfNotExists: true,
  extraInputs: [df.input.durableClient()],
  handler: triggerHandler(deps),
});
```

> **Key change**: the v3 `orchestrationClient` binding becomes `extraInputs: [df.input.durableClient()]`.

### 10b. Handler signature

```typescript
// BEFORE
export const handler = async (context: Context, documents: unknown): Promise<void> => {
  const client: DurableOrchestrationClient = df.getClient(context);
  // ...
};

// AFTER
export const handler = async (documents: unknown[], context: InvocationContext): Promise<void> => {
  const client = df.getClient(context);
  // ...
};
```

> **Note**: `documents` comes as the first parameter (like all non-HTTP triggers in v4), and `context` is the second.

---

## 11. Blob Triggers

Blob triggers in `function.json` become `app.storageBlob()` registrations in `main.ts`.

### 11a. Registration

```json
// BEFORE — function.json
{
  "bindings": [
    {
      "name": "InputBlob",
      "type": "blobTrigger",
      "direction": "in",
      "path": "spidassertions/{CF}-2025-03{name}",
      "connection": "IOPSTLOGS_STORAGE_CONNECTION_STRING"
    }
  ]
}
```

```typescript
// AFTER — main.ts
app.storageBlob("CheckXmlCryptoCVESamlResponse", {
  connection: "IOPSTLOGS_STORAGE_CONNECTION_STRING",
  path: "spidassertions/{CF}-2025-03{name}",
  handler: checkXmlCryptoHandler,
});
```

### 11b. Handler signature

```typescript
// BEFORE
const handler = async (context: Context): Promise<void> => {
  const blobName = context.bindingData.blobTrigger;
  const blobBuffer = context.bindings.InputBlob;
  // ...
};

// AFTER
const handler = async (blob: Buffer, context: InvocationContext): Promise<void> => {
  const blobName = context.triggerMetadata?.name as string;
  // blob content is the first parameter, no need for context.bindings
  // ...
};
```

> **Key changes**:
> - Blob content comes as the first parameter instead of `context.bindings.InputBlob`
> - Blob name is accessed via `context.triggerMetadata?.name` instead of `context.bindingData.blobTrigger`

---

## 12. Handler-Kit Queue Functions

Queue functions that use `@pagopa/handler-kit` and `@pagopa/handler-kit-azure-func` need a package upgrade. The handler pattern and `azureFunction()` API remain the same.

### 12a. Package upgrade

See [package.json changes](#upgrade-handler-kit-if-applicable).

```json
{
  "dependencies": {
    "@pagopa/handler-kit": "^1.1.1",
    "@pagopa/handler-kit-azure-func": "^2.0.8"
  }
}
```

### 12b. No handler code changes required

The `azureFunction(H.of(handler))` pattern continues to work after the package upgrade. The `index.ts` file can still be used as the entry point for handler-kit functions, or the function can be registered in `main.ts`.

```typescript
// Existing pattern — no changes needed in handler.ts or index.ts
import * as H from "@pagopa/handler-kit";
import { azureFunction } from "@pagopa/handler-kit-azure-func";

const createFunction = azureFunction(H.of(myHandler));

export default createFunction({
  inputDecoder: MyInputType,
  // ... deps
});
```

### 12c. Optional: register in `main.ts`

If you want to unify all registrations in `main.ts`, you can register the handler-kit function as a queue trigger:

```typescript
// main.ts
app.storageQueue("SanitizeProfileEmail", {
  connection: "CitizenAuthStorageConnection",
  queueName: "%SanitizeUserProfileQueueName%",
  handler: createSanitizeProfileEmailsFunction({
    inputDecoder: ProfileToSanitize,
    profileModel,
    telemetryClient: initTelemetryClient(),
  }),
});
```

In this case, delete the per-function `function.json` and `index.ts`.

---

## Summary Checklist

### Core migration
- [ ] `package.json`: add `"main": "dist/main.js"`, upgrade `@azure/functions` to `^4.0.0`, update `@pagopa/io-functions-commons` to `^30.0.0`, remove Express/winston deps
- [ ] Each HTTP `handler.ts`: replace `wrapRequestHandler` / `withRequestMiddlewares` with `wrapHandlerV4`, replace `Context` with `InvocationContext`, update logger calls
- [ ] Create `src/main.ts` with all registrations (HTTP + non-HTTP)

### Retry Policies

- [ ] Scan all `function.json` files for `retry` configurations **before deleting them**
- [ ] For queue triggers: add `extensions.queues` section to `host.json` with `maxDequeueCount` and `visibilityTimeout`
- [ ] For queue triggers: do NOT add `retry` option to `app.storageQueue()` registrations (not supported in GA)
- [ ] For CosmosDB triggers: add `retry` option to `app.cosmosDB()` registrations with strategy, maxRetryCount, and intervals
- [ ] Convert interval format from `"HH:mm:ss"` strings to `{ seconds: N }` / `{ minutes: N }` objects for v4
- [ ] If retry configs differ within the same trigger type, prompt the user for a unified value
- [ ] Verify that functions without retry in v3 have no retry in v4

### Cleanup

- [ ] Delete all per-function `function.json` files
- [ ] Delete all per-function `index.ts` entry points
- [ ] Update tests: replace `Context` mocks, update log spy references
- [ ] Update custom middlewares to use `RequiredHeaderMiddleware` / `RequiredBodyPayloadMiddleware` where applicable

### Durable Functions
- [ ] Upgrade `durable-functions` to `^3.0.0`
- [ ] Replace `IOrchestrationFunctionContext` with `OrchestrationContext` (from `durable-functions`)
- [ ] Replace `Task` / `RetryOptions` imports: `durable-functions/lib/src/classes` → `durable-functions`
- [ ] Replace `DurableOrchestrationClient` with `df.DurableClient` / `df.getClient(context)`
- [ ] Remove `df.orchestrator()` wrappers — pass generator directly to `df.app.orchestration()`
- [ ] Update `client.startNew(name, undefined, input)` → `client.startNew(name, { input })`
- [ ] Swap activity handler params: `(context, input)` → `(input, context)`
- [ ] Add orchestrator replay guards: `if (!context.df.isReplaying)` before log calls
- [ ] Register activities via `df.app.activity(name, { handler })` in `main.ts`
- [ ] Register orchestrators via `df.app.orchestration(name, handler)` in `main.ts`
- [ ] Update durable function test mocks (`OrchestrationContext`, `df.app` mock, param order)

### Queue Triggers
- [ ] Register queue triggers via `app.storageQueue(name, { connection, queueName, handler })` in `main.ts`
- [ ] Swap handler params: `(context, queueItem)` → `(queueItem, context)`
- [ ] Replace `context.bindings.X = value` with `context.extraOutputs.set(output, value)` for output bindings
- [ ] Add `extraInputs: [df.input.durableClient()]` if handler starts orchestrators

### CosmosDB Triggers
- [ ] Register CosmosDB triggers via `app.cosmosDB(name, { connection, databaseName, containerName, ... })` in `main.ts`
- [ ] Replace `orchestrationClient` binding with `extraInputs: [df.input.durableClient()]`
- [ ] Swap handler params: `(context, documents)` → `(documents, context)`

### Blob Triggers
- [ ] Register blob triggers via `app.storageBlob(name, { connection, path, handler })` in `main.ts`
- [ ] Handler receives `(blob: Buffer, context: InvocationContext)` instead of `(context: Context)`
- [ ] Replace `context.bindings.InputBlob` → first parameter; `context.bindingData.blobTrigger` → `context.triggerMetadata?.name`

### Handler-Kit Queue Functions
- [ ] Upgrade `@pagopa/handler-kit` to `^1.1.1` and `@pagopa/handler-kit-azure-func` to `^2.0.8`
- [ ] No handler code changes required — `azureFunction(H.of(...))` pattern is compatible
