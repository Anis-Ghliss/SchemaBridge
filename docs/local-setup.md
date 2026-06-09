# Local Setup

```bash
git clone <repo-url>
cd schema-bridge
docker compose up
```

Open:

- Admin UI: http://localhost:4000
- Runtime proxy: http://localhost:8080
- Backend health: http://localhost:4000/health

## Local Development Without Docker

```bash
npm install
npm run db:generate
npm run build
npm run test
npm run dev -w @schemabridge/frontend
npm run dev -w @schemabridge/backend
```

Set `DATABASE_URL` before running backend migrations locally:

```bash
export DATABASE_URL="postgresql://schemabridge:schemabridge@localhost:5432/schemabridge?schema=public"
npm run db:migrate
```

## First Local Flow

Follow [Getting Started](getting-started.md) for the full blank-database flow.
