---
name: azure-functions-v4-migration
description: Guides migration of Azure Functions apps from deprecated v3 model (Express-based, per-function index.ts + function.json) to the v4 programming model using wrapHandlerV4 from @pagopa/io-functions-commons. Covers HTTP triggers, Durable Functions (orchestrators + activities), Queue triggers, CosmosDB change feed triggers, Blob triggers, handler-kit queue functions, and retry policy migration. Use when asked to upgrade Azure Functions, migrate from v3 to v4, replace wrapRequestHandler with wrapHandlerV4, remove function.json and index.ts per-function files, create a single main.ts entry point, or migrate retry configurations from function.json to host.json / per-function v4 registrations.
license: Complete terms in LICENSE.txt
---

# Azure Functions v4 Migration Skill

This skill guides the migration of Azure Function apps in this monorepo from the deprecated v3 model (Express-based, per-function `index.ts` + `function.json`) to the v4 programming model using `wrapHandlerV4` from `@pagopa/io-functions-commons`. It covers **all trigger types** found in this project: HTTP, Durable Functions (orchestrators + activities), Queue, CosmosDB change feed, Blob, and handler-kit functions.

## When to Use This Skill

- Migrating an Azure Functions app from v3 to v4 programming model
- Replacing `wrapRequestHandler` / `withRequestMiddlewares` with `wrapHandlerV4`
- Converting per-function `function.json` + `index.ts` files to a single `src/main.ts` entry point
- Upgrading `@azure/functions` from `^3.x` to `^4.x`
- Upgrading `durable-functions` from `^1.x` to `^3.x`
- Replacing `Context` (v3) with `InvocationContext` (v4)
- Replacing `IOrchestrationFunctionContext` with `OrchestrationContext` (durable-functions v3)
- Replacing `df.orchestrator()` wrappers with `df.app.orchestration()` registrations
- Migrating activity triggers from `function.json` to `df.app.activity()` registrations
- Migrating queue triggers from `function.json` to `app.storageQueue()` registrations
- Migrating CosmosDB change feed triggers from `function.json` to `app.cosmosDB()` registrations
- Migrating blob triggers from `function.json` to `app.storageBlob()` registrations
- Upgrading `@pagopa/handler-kit` / `@pagopa/handler-kit-azure-func` for queue functions
- Replacing Express-style custom middlewares with `@pagopa/io-functions-commons` built-in middlewares
- Migrating `retry` blocks from `function.json` to `host.json` / per-function v4 registrations
- Converting queue trigger retry policies to `host.json` `extensions.queues` configuration
- Converting CosmosDB/Timer/EventHub trigger retry policies to per-function `retry` options in code

## Prerequisites

- `@azure/functions` upgraded to `^4.0.0` (moved from devDependencies to dependencies)
- `@pagopa/io-functions-commons` at `^30.0.0` or later (provides `wrapHandlerV4`)
- `durable-functions` upgraded to `^3.0.0` (if Durable Functions are used)
- `@pagopa/handler-kit` upgraded to `^1.1.1` and `@pagopa/handler-kit-azure-func` upgraded to `^2.0.8` (if handler-kit queue functions are used)
- `express`, `@pagopa/express-azure-functions`, `winston`, `winston-transport` removed from dependencies

## Step-by-Step Workflow

> For detailed code examples and before/after patterns see [migration-guide.md](./references/migration-guide.md).

### 1. Update `package.json`

See [package.json changes](./references/migration-guide.md#1-packagejson-changes).

### 2. Update each HTTP `handler.ts`

See [handler.ts changes](./references/migration-guide.md#2-handlerts-changes).

### 3. Create `src/main.ts`

See [main.ts creation](./references/migration-guide.md#3-create-srcmaints) and use the [main.ts template](./templates/main.ts.template) as a starting point.

### 4. Migrate Retry Policies

See [Retry Policy Migration](./references/migration-guide.md#4-retry-policy-migration).

> **Important**: Scan all `function.json` files for `retry` configurations **before deleting them** in the next step. Queue triggers use `host.json` `extensions.queues` (binding-level retry), while CosmosDB/Timer/EventHub triggers use per-function `retry` options in code registrations.

### 5. Delete per-function `function.json` and `index.ts` files

See [cleanup steps](./references/migration-guide.md#5-delete-per-function-files).

### 6. Update tests

See [test changes](./references/migration-guide.md#6-update-tests).

### 7. Update custom middlewares

See [middleware changes](./references/migration-guide.md#7-update-custom-middlewares).

### 8. Migrate Durable Functions (orchestrators + activities)

See [Durable Functions migration](./references/migration-guide.md#8-durable-functions-migration-durable-functions-v1--v3).

> **Important**: `durable-functions` v3 introduces **behavioral breaking changes** beyond signature updates. In particular, `DurableClient.getStatus()` now **throws an Error** on HTTP 404 (instance not found) instead of silently returning a partial status object. See [section 8k](./references/migration-guide.md#8k-handle-durable-functions-v3-behavioral-breaking-changes) for patterns to handle these corner cases.

### 9. Migrate Queue Triggers

See [Queue trigger migration](./references/migration-guide.md#9-queue-triggers).

### 10. Migrate CosmosDB Change Feed Triggers

See [CosmosDB trigger migration](./references/migration-guide.md#10-cosmosdb-trigger-change-feed).

### 11. Migrate Blob Triggers

See [Blob trigger migration](./references/migration-guide.md#11-blob-triggers).

### 12. Upgrade handler-kit Queue Functions

See [handler-kit upgrade](./references/migration-guide.md#12-handler-kit-queue-functions).

---

## Verification Steps

Run these checks **at the end of every migration iteration** (repeat for up to 5 iterations until all pass without errors).

### Step A — Build

```sh
yarn workspace io-functions-admin build
```

Confirm that `tsc` emits to `dist/` with no errors and the `dependency-check` post-build step passes.

### Step B — Lint (with auto-fix)

```sh
yarn workspace io-functions-admin lint
```

ESLint runs with auto-fix enabled. If fixes are applied, review the changes. Re-run until no errors are reported.

### Step C — Tests

```sh
yarn workspace io-functions-admin test
```

All `vitest` test suites must pass. If tests fail after migration, check that:

- Handler imports reference the updated `handler.ts` exports (not old `index.ts`).
- Mocked types use `InvocationContext` instead of `Context` (v3).
- Orchestrator handlers use `OrchestrationContext` instead of `IOrchestrationFunctionContext`.

### Step D — Parameter name alignment

For every HTTP trigger, verify that the `name` argument passed to each middleware **exactly matches** the corresponding identifier used by the runtime:

| Middleware                              | Must match                                       |
| --------------------------------------- | ------------------------------------------------ |
| `RequiredParamMiddleware(name, …)`      | Route placeholder `{name}` in `app.http` `route` |
| `OptionalParamMiddleware(name, …)`      | Route placeholder `{name}` in `app.http` `route` |
| `RequiredQueryParamMiddleware(name, …)` | Query-string key `?name=…`                       |
| `OptionalQueryParamMiddleware(name, …)` | Query-string key `?name=…`                       |
| `RequiredHeaderMiddleware(name, …)`     | HTTP header name — **lowercase** only            |

Mismatches are **silently swallowed** at runtime: validation always fails or returns `O.none` even for well-formed requests, with no error or warning emitted. See [Parameter name alignment between route/request and middlewares](./references/migration-guide.md#parameter-name-alignment-between-routerequest-and-middlewares) for examples and the special-case fiscal code middlewares.

### Iteration policy

- Run steps A → B → C in order after every batch of changes.
- If any step fails, fix the reported errors before proceeding to the next function.
- Stop after **5 iterations**; if issues persist, surface them to the developer for manual review.
- All three steps must be green before the migration of a function is considered complete.

---

## References

- [Migration Guide](./references/migration-guide.md)
- [main.ts Template](./templates/main.ts.template)
- [PR #672 – io-public v4 upgrade](https://github.com/pagopa/io-auth-n-identity-domain/pull/672)
- [PR #586 – io-messages pushnotif-func v4 + durable-functions v3 migration](https://github.com/pagopa/io-messages/pull/586)
- [@pagopa/io-functions-commons wrapHandlerV4 source](https://github.com/pagopa/io-functions-commons)
