# Changelog

## Unreleased

### Added
- **Contract drift detection.** The proxy now passively compares inbound, transformed, upstream, and response payloads against each binding's declared schemas and records divergences — *added* fields (an upstream introduced a key), *missing* fields, and *type changes* — aggregated per binding/stage/path with first/last-seen timestamps and a hit count. Detection is fire-and-forget (never adds latency or blocks traffic) and runs regardless of `validationMode`. Tune coverage with `DRIFT_SAMPLE_RATE`.
- New admin endpoints: `GET /drift` (list, filter by `bindingId`), `DELETE /drift/:id` (acknowledge), `DELETE /drift` (clear).
- New **Drift** view in the GUI: a filterable, auto-refreshing list of drift signals (by binding and kind) with per-row acknowledge and bulk clear, linking back to the originating binding.
- **Control-plane reporting (hybrid topology).** When `CONTROL_PLANE_URL` is set, the data-plane instance periodically pushes a snapshot of its drift state to `<url>/ingest/drift` (authenticated with `CONTROL_PLANE_TOKEN`, identified by `BRIDGE_INSTANCE_ID`). Reporting is resilient — a control plane being unreachable never affects proxied traffic — and the proxy stays entirely in the customer's infra. Standalone/OSS deployments are unaffected unless they opt in. The `DriftReport` wire contract is defined in `@schemabridge/shared-types`.
- **Control-plane service (`@schemabridge/control-plane`).** A new app that consumes the `DriftReport` contract: `POST /ingest/drift` (instance-token auth, snapshot reconciliation per instance) and `GET /fleet/drift` (tenant-key auth, fleet-wide query with instance/binding/kind filters). In-memory storage for now; Postgres persistence and the fleet dashboard UI + alerting are the next slices.

## v0.1.6 — 2026-06-09

### Security
- Added SSRF egress controls: upstream targets are validated when a binding is saved and before every forwarded request. Non-HTTP schemes and link-local / cloud-metadata addresses (including IPv4-mapped IPv6 forms) are always blocked; loopback/private ranges can be blocked with `PROXY_ALLOW_PRIVATE_UPSTREAMS=false` and upstreams restricted with `PROXY_UPSTREAM_ALLOWLIST` (re-checked against DNS to mitigate rebinding).
- Stopped forwarding the inbound `Authorization` header upstream so proxy app keys cannot leak to upstream services; removed it from the default forward-header set.
- Switched the admin token check to constant-time comparison.
- Hardened rate limiting against `X-Forwarded-For` spoofing; the header is only trusted when `TRUST_PROXY=true`.
- Made the admin auth gate fail-closed so new API routes require a token by default.
- Stopped returning raw upstream connection errors to callers (internal hostnames/ports stay in the server-side trace).
- Added recursion-depth bounds to schema parsing and example validation to prevent stack-exhaustion DoS.
- Added `PROXY_LOG_BODIES=false` to keep request/response payloads out of `ProxyRequestLog`.
- Moved the admin token from `localStorage` to `sessionStorage` in the GUI.
- In production, the bridge now refuses to start unauthenticated (`ADMIN_API_KEY` unset or `PROXY_REQUIRE_AUTH` not true) unless `BRIDGE_ALLOW_INSECURE=true`.

## v0.1.5 — 2026-06-09

### Added
- Added getting started, concepts, validation, and release checklist documentation for OSS users.
- Added contribution, security, issue, and pull request templates.
- Added broader proxy validation coverage for strict/off modes, arrays, transformed target payloads, and response validation.

### Verified
- Ran a blank-database Docker smoke test covering schema creation, mapping creation, binding creation, strict validation, proxy forwarding, and transformed payload delivery to a receiver.

## v0.1.4 — 2026-06-09

### Changed
- Added a dedicated SchemaBridge app icon and favicon.
- Aligned the sidebar brand area with the top navigation bar.

## v0.1.3 — 2026-06-09

### Removed
- Removed the bundled local bootstrap profile, preload-data path, and prefilled payload shortcuts so new installs start from a blank real scenario.

## v0.1.2 — 2026-06-09

### Added
- Binding validation modes: `off`, `warn`, and `strict`, with validation errors shown in traffic traces.
- App-scoped proxy keys and Try UI support for sending as a selected app without pasting the full key each time.
- Expanded request traces with incoming request, transformed request, upstream response, app attribution, and errors.
- Runtime safety controls for body limits, per-client rate limits, upstream timeouts, and request-log retention.

### Changed
- Mapping creation now starts empty; users explicitly create mapping versions and links.
- Deleting schemas and mappings now protects dependent resources by default and supports cascade where appropriate.
- Create/detail navigation returns to the list when switching tabs, with unsaved-change confirmation for drafts.

### Fixed
- Array wildcard mappings like `items[].sku` to `lineItems[].sku` now transform correctly.
- Binding Try UI can derive a source payload example from the selected mapping.
- Empty JSON delete requests no longer trigger confusing Fastify content-type errors.

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
- Graceful SIGTERM/SIGINT shutdown; clean exit-0 on `docker compose stop`.
- Runtime safety controls for body size, per-client rate limits, upstream timeouts, and proxy request log retention are configurable by environment variable.

### Known limitations (deferred)
- Engine supports field renames + small transform enum only. A full expression language (jsonata/jq) is the next bet.
- No multi-tenant isolation and no audit log of admin operations.
- Admin auth is a single shared token, not a real user system.
