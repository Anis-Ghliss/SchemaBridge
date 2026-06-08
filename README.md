# SchemaBridge

SchemaBridge is a runtime mapping middleware. It sits between two HTTP services, applies a configured schema-to-schema mapping to the request payload (and optionally the response), and forwards traffic upstream. The mapping designer GUI lives next to the proxy so operators can adjust transforms without redeploying.

## Run

Default stack (Postgres + backend + frontend):

```bash
docker compose up --build
```

- GUI: http://localhost:5173
- Admin API: http://localhost:4000
- Proxy port: http://localhost:8080

Demo profile (adds two example upstreams + a pre-seeded `POST /customers` binding):

```bash
docker compose --profile demo up --build
```

Then:

```bash
curl -X POST http://localhost:8080/customers \
  -H 'content-type: application/json' \
  -d '{"customerId":"c-42","customerName":"Ada","customerEmail":"ada@example.com","customerSignupDate":"2026-01-02"}'
```

The bridge reshapes the body into the v2 layout, forwards to `service-b:8082`, then maps the response back to v1 shape.

## Workspace

- `apps/frontend`: React + Vite UI (mapping designer + bindings panel + proxy probe)
- `apps/backend`: Fastify admin API on :4000 and proxy on :8080 (single process)
- `packages/shared-types`: shared Zod contracts
- `packages/schema-parser`: JSON-to-field-tree parser
- `packages/transformation-engine`: payload transformer (path rename + small transform enum)
- `examples/services`: tiny stub upstreams used by the demo profile
- `examples/seed`: seed file consumed by `BINDINGS_SEED_FILE`
- `docs`: architecture, API, setup, roadmap

## Verification

```bash
npm install
npm run lint
npm run test
npm run build
```
