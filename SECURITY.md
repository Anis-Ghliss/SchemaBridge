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

## Production Baseline

For production deployments:

- set `ADMIN_API_KEY`
- set `PROXY_REQUIRE_AUTH=true`
- create one app key per calling service
- scope app keys to selected bindings where possible
- pin Docker images to a release tag
- use TLS at the reverse proxy/load balancer
- keep Postgres on a private network
- configure `PROXY_REQUEST_LOG_RETENTION_DAYS`

