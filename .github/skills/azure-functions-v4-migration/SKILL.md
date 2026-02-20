---
name: azure-functions-v4-migration
description: Guides migration of Azure Functions apps from deprecated v3 model (Express-based, per-function index.ts + function.json) to the v4 programming model using wrapHandlerV4 from @pagopa/io-functions-commons. Use when asked to upgrade Azure Functions, migrate from v3 to v4, replace wrapRequestHandler with wrapHandlerV4, remove function.json and index.ts per-function files, or create a single main.ts entry point.
license: Complete terms in LICENSE.txt
---

# Azure Functions v4 Migration Skill

This skill guides the migration of Azure Function apps in this monorepo from the deprecated v3 model (Express-based, per-function `index.ts` + `function.json`) to the v4 programming model using `wrapHandlerV4` from `@pagopa/io-functions-commons`.

## When to Use This Skill

- Migrating an Azure Functions app from v3 to v4 programming model
- Replacing `wrapRequestHandler` / `withRequestMiddlewares` with `wrapHandlerV4`
- Converting per-function `function.json` + `index.ts` files to a single `src/main.ts` entry point
- Upgrading `@azure/functions` from `^3.x` to `^4.x`
- Replacing `Context` (v3) with `InvocationContext` (v4)
- Replacing Express-style custom middlewares with `@pagopa/io-functions-commons` built-in middlewares

## Prerequisites

- `@azure/functions` upgraded to `^4.0.0` (moved from devDependencies to dependencies)
- `@pagopa/io-functions-commons` at `^30.0.0` or later (provides `wrapHandlerV4`)
- `express`, `@pagopa/express-azure-functions`, `winston`, `winston-transport` removed from dependencies

## Step-by-Step Workflow

> For detailed code examples and before/after patterns see [migration-guide.md](./references/migration-guide.md).

### 1. Update `package.json`

See [package.json changes](./references/migration-guide.md#1-packagejson-changes).

### 2. Update each `handler.ts`

See [handler.ts changes](./references/migration-guide.md#2-handlerts-changes).

### 3. Create `src/main.ts`

See [main.ts creation](./references/migration-guide.md#3-create-srcmaints) and use the [main.ts template](./templates/main.ts.template) as a starting point.

### 4. Delete per-function `function.json` and `index.ts` files

See [cleanup steps](./references/migration-guide.md#4-delete-per-function-files).

### 5. Update tests

See [test changes](./references/migration-guide.md#5-update-tests).

## References

- [Migration Guide](./references/migration-guide.md)
- [main.ts Template](./templates/main.ts.template)
- [PR #672 – io-public v4 upgrade](https://github.com/pagopa/io-auth-n-identity-domain/pull/672)
- [@pagopa/io-functions-commons wrapHandlerV4 source](https://github.com/pagopa/io-functions-commons)
