# Changelog

## v0.1.1 — 2026-06-08

### Fixed
- Published image is now multi-arch (`linux/amd64` + `linux/arm64`), so Apple Silicon hosts can pull and run it. The v0.1.0 image was amd64-only.

## v0.1.0 — 2026-06-08

First public release.

### Runtime
- Programmable proxy on `:8080` that matches `ProxyBinding` records, applies a mapping to the request body, forwards to the configured upstream via undici, and optionally maps the response back.
- Live hot-reload: editing a mapping or binding in the GUI takes effect on the next request without a restart.

### Transformation engine
- Dot-notation `sourcePath → targetPath` rules with array index support and per-rule `defaultValue`.
- Optional `transform` on each rule: `string` · `number` · `boolean` · `lowercase` · `uppercase` · `iso-date`. Coercion failures become explicit errors in the trace.
- Mapping versions are immutable; saving creates a new version and "Restore" updates the live route.

### Admin surface
- `:4000` serves the React GUI and the admin REST API from the same Fastify process.
- Resource-centric layout: Bindings · Mappings · Schemas · Apps · Live, each with list + detail views.
- JSON content via CodeMirror 6 with syntax highlighting, validation badge, and a Format button.
- Delete operations refuse to drop schemas/mappings that have dependents (409 with a clear message).

### Authentication
- **Proxy port** — `PROXY_REQUIRE_AUTH=true` requires `Authorization: Bearer <sb_…>` belonging to a registered app. Apps are scoped to "all bindings" or a specific subset; disabled apps return 403.
- **Admin port** — `ADMIN_API_KEY` env var enables Bearer auth on the admin API; the GUI prompts for the token on first 401.
- Keys are stored as sha-256 hashes; verification uses timing-safe compare. Plaintext key shown exactly once on create/rotate.

### Observability
- Live tab tails every proxied request with method, path, status, duration, binding, and the app that authorized it.
- Per-binding "Recent traffic" view on each binding's detail page.
- Request body, transformed body, response body, and any stage errors expand inline.

### Packaging
- Single image (`ghcr.io/anis-ghliss/schemabridge`) — backend + frontend in one Fastify process.
- Demo profile in `docker-compose.yml` brings up two stub upstream services plus a pre-seeded `POST /customers` binding and a `demo-client` app key for one-curl verification.
- Graceful SIGTERM/SIGINT shutdown; clean exit-0 on `docker compose stop`.

### Known limitations (deferred)
- Engine supports field renames + small transform enum only. A full expression language (jsonata/jq) is the next bet.
- No multi-tenant isolation, no audit log of admin operations, no automatic retention on `ProxyRequestLog`.
- Admin auth is a single shared token, not a real user system.
