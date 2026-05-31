# Copilot Instructions for myshop-api

## Build, Test, and Lint Commands

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run format
pnpm run start
pnpm run start:dev
pnpm run start:prod
pnpm run test
pnpm run test -- src/app.controller.spec.ts
pnpm run test:e2e
pnpm run test:e2e -- test/app.e2e-spec.ts
pnpm run test:cov
```

## High-Level Architecture

- The app is a single NestJS service at the moment: `src/main.ts` bootstraps `AppModule` and listens on `process.env.PORT ?? 4000`.
- `AppModule` currently wires one controller/service pair: `AppController` delegates `GET /` to `AppService.getHello()`.
- Tests are split into two Jest contexts:
  - Unit tests run from the `package.json` Jest config (`rootDir: src`, `*.spec.ts`).
  - E2E tests run from `test/jest-e2e.json` and bootstrap the full Nest app with Supertest (`*.e2e-spec.ts`).

## Key Conventions

- ESLint is type-aware (`typescript-eslint` with `projectService: true`) and `pnpm run lint` applies fixes (`--fix`) by default.
- Prettier is enforced through ESLint (`eslint-plugin-prettier/recommended`) and `.prettierrc` uses `singleQuote: true` and `trailingComma: all`.
- TypeScript uses `module`/`moduleResolution: nodenext`, decorators metadata enabled, `strictNullChecks: true`, and `noImplicitAny: false`.
- Keep unit tests under `src/**/*.spec.ts` and e2e tests under `test/**/*.e2e-spec.ts` so they are picked up by the correct Jest config.
