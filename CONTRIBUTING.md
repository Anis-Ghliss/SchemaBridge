# Contributing

Thanks for helping improve SchemaBridge. This project is still early, so the most valuable contributions are small, reproducible, and tied to a real integration problem.

## Development Setup

```bash
npm install
npm run db:generate
npm run build
npm run test
```

For local backend work, set `DATABASE_URL` and run migrations:

```bash
export DATABASE_URL="postgresql://schemabridge:schemabridge@localhost:5432/schemabridge?schema=public"
npm run db:migrate
```

For Docker-based testing:

```bash
docker compose up --build
```

The admin UI runs on <http://localhost:4000>. The runtime proxy runs on <http://localhost:8080>.

## Before Opening A PR

Run:

```bash
npm run lint
npm run test
npm run build
```

If the PR changes React UI, also run:

```bash
npx -y react-doctor@latest . --verbose --diff
```

For proxy, validation, auth, or persistence changes, add or update backend integration tests.

## Pull Request Scope

Prefer focused PRs:

- one bug fix
- one feature slice
- one documentation update
- one refactor with no behavior change

Avoid mixing formatting-only churn with functional changes.

## Testing Expectations

Use tests that match the risk:

- transformation behavior: package tests in `packages/transformation-engine`
- schema parsing: package tests in `packages/schema-parser`
- admin API behavior: `apps/backend/src/app.test.ts`
- runtime proxy behavior: `apps/backend/src/proxyApp.test.ts`
- end-to-end local verification: Docker flow from `docs/getting-started.md`

## Commit Messages

Use short imperative messages, for example:

```text
Validate transformed proxy payloads
Document app key rotation
Fix binding delete confirmation
```

## Security

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).

