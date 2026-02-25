# GitHub Copilot Instructions — io-functions-admin

This file is automatically loaded by GitHub Copilot agents to provide context about the repository structure, conventions, and workflows.

---

## 1. Monorepo Overview

| Property        | Value                  |
| --------------- | ---------------------- |
| Package manager | Yarn 4.1.1 (Berry)     |
| Orchestrator    | Turborepo `^2.6.1`     |
| Workspaces      | `apps/*`, `packages/*` |
| Node version    | ≥ 20                   |

All top-level scripts delegate to Turborepo (e.g. `yarn build` → `turbo run build`).

**Packages:**

- `apps/io-functions-admin` — Azure Functions v4 app
- `packages/typescript-config-node` — shared TypeScript configuration (`@pagopa/typescript-config-node`)

---

## 2. Common Commands (run from repo root)

| Goal                      | Command                                   |
| ------------------------- | ----------------------------------------- |
| Install dependencies      | `yarn install`                            |
| Build all packages        | `yarn build`                              |
| Type-check                | `yarn typecheck`                          |
| Run tests                 | `yarn test`                               |
| Run tests with coverage   | `yarn test:coverage`                      |
| Lint (with auto-fix)      | `yarn lint`                               |
| Lint (check only, no fix) | `yarn lint:check`                         |
| Lint OpenAPI specs        | `yarn lint-api`                           |
| Generate OpenAPI types    | `yarn generate`                           |
| Clean build artifacts     | `yarn clean`                              |
| Full pre-merge check      | `yarn code-review`                        |
| Start functions locally   | `yarn workspace io-functions-admin start` |

`yarn code-review` runs `generate`, `format:check`, `lint:check`, and `test:coverage` — this is the authoritative pre-merge gate.

---

## 3. App-specific Commands (`apps/io-functions-admin`)

These can be run from the app directory or via `yarn workspace io-functions-admin <script>`.

| Script               | What it does                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `yarn build`         | `tsc` → emits to `dist/`, then runs `dependency-check`. **No stdout on success** — an empty output means the build passed. |
| `yarn build:watch`   | `tsc -w` for incremental development                                                                                       |
| `yarn typecheck`     | `tsc --noemit` (type-check without emitting)                                                                               |
| `yarn test`          | `vitest run`                                                                                                               |
| `yarn test:coverage` | `vitest run --coverage` → `coverage/` (lcov + text)                                                                        |
| `yarn lint`          | ESLint with auto-fix                                                                                                       |
| `yarn lint:check`    | ESLint check only                                                                                                          |
| `yarn generate`      | Regenerate TypeScript types from `openapi/index.yaml`                                                                      |
| `yarn clean`         | Delete `dist/`                                                                                                             |
| `yarn start`         | Start Azure Functions host locally (requires `.env`)                                                                       |

**Testing libraries:** `vitest ^3.2.4`, `@vitest/coverage-v8`, `fast-check ^1.26.0` (property-based testing).

---

## 4. Repository Structure & Conventions

```
apps/
  io-functions-admin/
    main.ts                          # Single entry point — all function registrations
    host.json                        # Azure Functions host config (v2, extension bundle 4.x)
    <FunctionName>/
      handler.ts                     # Handler factory + pure handler function
      __tests__/
        handler.test.ts              # Unit tests (vitest)
    generated/                       # ⚠️ Auto-generated from OpenAPI — do NOT edit
    openapi/                         # OpenAPI YAML specs
    utils/                           # Shared utilities
    types/                           # Shared TypeScript types
    __mocks__/                       # Vitest module mocks
packages/
  typescript-config-node/            # Shared tsconfig (target: es2022, module: node16, strict)
```

**TypeScript config:** extends `@pagopa/typescript-config-node`; `target: es2022`, `module: node16`, `moduleResolution: node16`, strict mode, `outDir: dist`.

**ESLint config:** `@pagopa/eslint-config` v5 flat config; ignores `dist/**` and `generated/**`.

---

## 5. Azure Functions v4 Model

The app uses the **Azure Functions v4 programming model** (`@azure/functions ^4`, `durable-functions ^3`):

- There are **no `function.json` files** and **no per-function `index.ts`** files.
- All functions are registered in a **single `main.ts`** entry point using:
  - `app.http(name, { methods, route, authLevel, handler })` — HTTP triggers
  - `df.app.activity(name, { handler })` — Durable activity functions
  - `df.app.orchestration(name, handler)` — Durable orchestrators
  - `app.cosmosDB(name, { ... })` — CosmosDB change-feed triggers
  - `app.storageQueue(name, { ... })` — Queue triggers
  - `app.storageBlob(name, { ... })` — Blob triggers
- HTTP handlers use `wrapHandlerV4` from `@pagopa/io-functions-commons/dist/src/utils/azure-functions-v4-express-adapter`.
- Handler-kit queue functions use `azureFunction(H.of(...))` from `@pagopa/handler-kit-azure-func`.
- Context type is `InvocationContext` (v4); orchestrators use `OrchestrationContext` from `durable-functions`.

**For detailed migration patterns and code templates**, refer to the bundled skill:
`.github/skills/azure-functions-v4-migration/SKILL.md`

---

## 6. Local Environment Setup

1. Copy `apps/io-functions-admin/env.example` to `apps/io-functions-admin/.env`.
2. Fill in the required values. Key groups:

| Group             | Variables                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure Storage     | `AzureWebJobsStorage`, `StorageConnection`, `AssetsStorageConnection`, `UserDataArchiveStorageConnection`, `UserDataBackupStorageConnection`, `SubscriptionFeedStorageConnection`, `FailedUserDataProcessingStorageConnection`, `CitizenAuthStorageConnection`, `LOCKED_PROFILES_STORAGE_CONNECTION_STRING`, `PROFILE_EMAILS_STORAGE_CONNECTION_STRING` |
| CosmosDB          | `COSMOSDB_CONNECTION_STRING`, `COSMOSDB_URI`, `COSMOSDB_KEY`, `COSMOSDB_NAME`                                                                                                                                                                                                                                                                           |
| Azure APIM        | `SERVICE_PRINCIPAL_CLIENT_ID`, `SERVICE_PRINCIPAL_CLIENT_SECRET`, `SERVICE_PRINCIPAL_TENANT_ID`, `AZURE_APIM`, `AZURE_APIM_HOST`, `AZURE_APIM_RESOURCE_GROUP`, `AZURE_SUBSCRIPTION_ID`                                                                                                                                                                  |
| Internal APIs     | `PUBLIC_API_URL`, `PUBLIC_API_KEY`, `SESSION_API_URL`, `SESSION_API_KEY`, `SESSION_MANAGER_INTERNAL_API_URL`, `SESSION_MANAGER_INTERNAL_API_KEY`                                                                                                                                                                                                        |
| Durable Functions | `SLOT_TASK_HUBNAME`, `DURABLE_FUNCTION_STORAGE_CONNECTION_STRING`                                                                                                                                                                                                                                                                                       |
| Dev only          | `NODE_ENV=dev`, `NODE_TLS_REJECT_UNAUTHORIZED=0`                                                                                                                                                                                                                                                                                                        |

---

## 7. CI/CD & Release

### GitHub Actions Workflows

| Workflow          | File                                                | Trigger                      |
| ----------------- | --------------------------------------------------- | ---------------------------- |
| Code review       | `.github/workflows/code-review.yaml`                | Pull request                 |
| Deploy            | `.github/workflows/deploy-pipelines.yaml`           | Push to main/tags            |
| Infra code review | `.github/workflows/infra_code_review.yaml`          | Pull request (infra changes) |
| Infra release     | `.github/workflows/infra_release.yaml`              | Push to main (infra changes) |
| PR title linter   | `.github/workflows/pr-title-linter-and-linker.yaml` | Pull request                 |
| Release           | `.github/workflows/release.yaml`                    | Push to main                 |
| SDK publish       | `.github/workflows/publish-sdk.yaml`                | Release tags                 |

### Versioning with Changesets

Versioning is managed with `@changesets/cli`.

**Developer responsibility** — before opening a PR, run:

```sh
yarn changeset
```

This prompts you to describe your changes (patch/minor/major) and commits a changeset file to `.changeset/`. This file **must** be included in the PR.

**Automated by the pipeline** — `yarn version` (bumps `package.json` versions and consumes changeset files) and `yarn release` (creates git tags) are executed automatically by the release pipeline. **Do not run these commands manually.**
