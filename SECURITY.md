# Security Policy

SchemaBridge is integration middleware. Treat admin access, proxy app keys, traffic logs, and stored schemas as sensitive.

## Supported Versions

Security fixes target the latest released version.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | Best effort |

## Reporting A Vulnerability

Please do not open a public GitHub issue for a suspected vulnerability.

Report privately by emailing the project maintainer or by using GitHub private vulnerability reporting if it is enabled on the repository.

Include:

- affected version or commit
- deployment mode, such as Docker image tag or source build
- whether `ADMIN_API_KEY` is set
- whether `PROXY_REQUIRE_AUTH` is enabled
- reproduction steps
- expected impact
- any logs or screenshots with secrets removed

## Secret Handling

When reporting issues, remove:

- `ADMIN_API_KEY`
- full `sb_...` proxy app keys
- database credentials
- bearer tokens
- private payload data

SchemaBridge stores proxy app keys as hashes and only shows full plaintext keys on creation or rotation. If a key is leaked, rotate it from the Apps page and update the calling service.

## Built-in Protections

- **Egress / SSRF controls.** Upstream targets are validated when a binding is
  saved *and* before each forwarded request. Non-HTTP schemes and link-local /
  cloud-metadata addresses (e.g. `169.254.169.254`, including IPv4-mapped IPv6
  forms) are always rejected. Set `PROXY_ALLOW_PRIVATE_UPSTREAMS=false` to also
  block loopback/private ranges, and/or `PROXY_UPSTREAM_ALLOWLIST` to restrict
  upstreams to named hosts (which is also re-checked against DNS to mitigate
  rebinding).
- **Credential isolation.** The `Authorization` header used to authenticate to
  the bridge is never forwarded upstream, so proxy app keys cannot leak to
  upstream services. It is excluded from the default forward-header set.
- **Constant-time admin auth.** The admin token is compared in constant time.
- **Rate-limit integrity.** `X-Forwarded-For` is only trusted for client
  identification when `TRUST_PROXY=true`; otherwise the socket IP is used so the
  header cannot be spoofed to bypass limits.
- **Error hygiene.** Upstream connection failures return a generic message to
  the caller; internal hostnames/ports stay in the server-side trace.
- **Body capture control.** Set `PROXY_LOG_BODIES=false` to keep request and
  response payloads out of `ProxyRequestLog`.

## Production Baseline

For production deployments:

- set `ADMIN_API_KEY`
- set `PROXY_REQUIRE_AUTH=true`
- create one app key per calling service
- scope app keys to selected bindings where possible
- set `TRUST_PROXY=true` only when behind a reverse proxy that overwrites `X-Forwarded-For`
- restrict egress with `PROXY_ALLOW_PRIVATE_UPSTREAMS=false` and/or `PROXY_UPSTREAM_ALLOWLIST` where feasible
- set `PROXY_LOG_BODIES=false` when traffic carries PII or secrets
- pin Docker images to a release tag
- use TLS at the reverse proxy/load balancer
- keep Postgres on a private network
- configure `PROXY_REQUEST_LOG_RETENTION_DAYS`

