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

## Demo Flow

1. Load sample source and target schemas.
2. Save schemas.
3. Connect source leaf fields to target leaf fields on the canvas.
4. Save the mapping.
5. Paste a source payload in the playground.
6. Run the transformation.
7. Create a new version or restore an existing version from the editor toolbar.
