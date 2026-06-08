# SchemaBridge

[![CI](https://github.com/Anis-Ghliss/SchemaBridge/actions/workflows/ci.yml/badge.svg)](https://github.com/Anis-Ghliss/SchemaBridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Programmable mapping middleware for JSON-over-HTTP workflows.** Design payload transformations in a visual editor, then deploy them as runtime bindings — traffic hitting the bridge is reshaped in-flight and forwarded to the right upstream. Drop it anywhere JSON shapes don't agree.

![Bindings — every route the bridge serves, in one searchable list](docs/screenshots/bindings.png)

The GUI is organized around the four things a team actually manages: **Bindings** (routes on the proxy), **Mappings** (the field-level rules), **Schemas** (the payload shapes), and **Live** (an observable tail of every proxied request). Each is its own searchable list with detail views — no linear flow forced on you when you have ten services and twenty mappings.

![Mappings — topology at a glance with "used by" counts](docs/screenshots/mappings.png)
![Live — filterable tail with binding attribution and status colors](docs/screenshots/live.png)

A **Quick start** modal in the sidebar walks new installs through capturing two shapes, suggesting field pairings, and deploying the first binding — then drops you on the new binding's page to send a test request.

## Why

Most teams hit the same problem at every integration boundary: two systems exchange JSON but disagree on the shape. The usual fix is to write adapter code in one service, then ship it again when the contract changes. SchemaBridge moves that work out of the codebase and into a live, configurable layer.

Use it for:

- **API version skew** — keep v1 endpoints alive while the backend speaks v2.
- **Anti-corruption layers** — translate sprawling legacy payloads into a clean internal shape before they reach modern services.
- **Multi-source ingestion** — normalize slightly different payloads from many producers into a single contract for one consumer.
- **Partner integrations** — accept third-party shapes at the edge without polluting your domain code.
- **Service mesh translation** — apply per-route shape adapters between microservices without touching either side.
- **API gateways / BFFs** — collapse the "write a tiny mapping function" task into a configuration change.

Each route is a `ProxyBinding`: method + path pattern + upstream URL + a mapping (and optionally a reverse mapping for the response). Bindings are independent, hot-reloaded on save, and there can be as many as you need — the bridge scales from "one service in front of another" to a fan-out hub that adapts dozens of routes into your stack.

## Drop into your stack

SchemaBridge ships as **one image**. Add it to your existing `docker-compose.yml` alongside whatever you already run; point your services at `bridge:8080`, configure routes in the GUI on `:4000`.

```yaml
services:
  schemabridge:
    image: ghcr.io/anis-ghliss/schemabridge:latest
    ports:
      - "8080:8080"   # runtime proxy — point your services here
      - "4000:4000"   # admin API + GUI
    environment:
      DATABASE_URL: postgres://app:app@bridge-db:5432/schemabridge
      # Optional: pre-seed schemas, mappings, and bindings on first boot
      # BINDINGS_SEED_FILE: /seed/bindings.json
    # volumes:
    #   - ./schemabridge-seed.json:/seed/bindings.json:ro
    depends_on: [bridge-db]

  bridge-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: schemabridge
    volumes:
      - schemabridge-data:/var/lib/postgresql/data

volumes:
  schemabridge-data:
```

Open <http://localhost:4000>, create a binding, then send traffic to `http://localhost:8080/<your-path>`.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — (required) | Postgres connection string |
| `PORT` | `4000` | Admin API + GUI port |
| `PROXY_PORT` | `8080` | Runtime proxy port |
| `CORS_ORIGIN` | `*` | CORS allow-list for the admin API |
| `BINDINGS_SEED_FILE` | unset | JSON file with schemas/mappings/bindings to load on first boot |

## Try it locally (with built-in demo)

The repo includes a `demo` compose profile with two stub upstream services and a pre-seeded `POST /customers` binding:

```bash
docker compose --profile demo up --build
```

- GUI + Admin: <http://localhost:4000>
- Runtime proxy: <http://localhost:8080>

Send a v1-shaped payload through the proxy:

```bash
curl -X POST http://localhost:8080/customers \
  -H 'content-type: application/json' \
  -d '{"customerId":"c-42","customerName":"Ada","customerEmail":"ada@example.com","customerSignupDate":"2026-01-02"}'
```

The bridge reshapes the body into the v2 layout (including ISO-date normalization), forwards to the upstream, then maps the response back to v1 shape before returning it to you.

## Screenshots

| Schemas | Quick start |
| --- | --- |
| ![Schema registry with dependents](docs/screenshots/schemas.png) | ![Guided 5-step modal](docs/screenshots/quick-start.png) |

## How it works

```
client ──HTTP──►  proxy :8080  ──►  match ProxyBinding  ──►  apply request mapping
                                                              ├─► forward via undici
                                                              │      to upstreamBaseUrl + path
                                                              ◄── upstream response
                                                              └─► apply response mapping (optional)
                                                              ──► return to client

GUI    ──HTTP──►  admin :4000  ──►  CRUD: schemas / mappings / bindings
                                    │
                                    └─► live reload of proxy on every save
```

Two Fastify instances in one Node process share a Prisma client into Postgres. Mappings are versioned; restoring an old version updates the live route without redeploying.

## Mapping rules

Each rule is `sourcePath → targetPath` with dot-notation paths (supports array indexes). Optional fields:

- `defaultValue` — used when the source path is missing.
- `transform` — small coercion enum: `string` · `number` · `boolean` · `lowercase` · `uppercase` · `iso-date`.

The transformation engine is framework-neutral and lives in `packages/transformation-engine`, so the same rules drive the GUI preview, the runtime proxy, and any future workers or CLI tools.

## Workspace

- `apps/frontend` — React + Vite GUI (3-tab shell: Design / Deploy / Try it)
- `apps/backend` — Fastify admin API on `:4000` and proxy on `:8080`, single process
- `packages/shared-types` — Zod contracts shared by GUI and API
- `packages/schema-parser` — JSON-example to field-tree parser
- `packages/transformation-engine` — payload transformer (path rename + transform enum)
- `examples/services` — stub upstreams used by the `demo` profile
- `examples/seed` — bootstrap file consumed via `BINDINGS_SEED_FILE`
- `docs` — architecture, API (OpenAPI), local setup, roadmap

## Verification

```bash
npm install
npm run lint
npm run test
npm run build
```

## Roadmap highlights

See `docs/roadmap.md` for the full list. Near-term bets: a full expression language (jsonata/jq) for rules beyond simple renames, observability for proxied traffic, OpenAPI ingestion, and AI-assisted mapping suggestions.
