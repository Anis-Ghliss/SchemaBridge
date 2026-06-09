# Local Setup

```bash
git clone <repo-url>
cd schema-bridge
docker compose up
```

Open:

- Frontend: http://localhost:5173
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

1. Create a source schema from a real incoming JSON payload.
2. Create a target schema from the JSON shape your destination service expects.
3. Create a mapping and connect source fields to target fields.
4. Save the mapping.
5. Create a binding for the proxy path and destination service URL.
6. Use the binding's Try tab to inspect the transformed request before sending.
7. Check Live traffic to verify incoming payload, transformed payload, response, and errors.
