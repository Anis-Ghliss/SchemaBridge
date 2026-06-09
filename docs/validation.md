# Validation

Validation is configured per binding. It uses the saved example schemas attached to the request mapping and optional response mapping.

SchemaBridge validation is intentionally lightweight:

- fields present in the example are required
- JSON types must match the example
- array items are validated against the first example item
- extra fields are allowed
- empty example arrays do not validate item shape

## Modes

| Mode | Behavior |
| --- | --- |
| `off` | No schema validation. Mapping still runs. |
| `warn` | SchemaBridge forwards the request and stores validation errors in Live traffic. |
| `strict` | SchemaBridge blocks invalid payloads. |

## Request Validation Stages

Strict request validation can fail in two places.

### `request-source`

The original incoming request does not match the source schema.

Example response:

```json
{
  "stage": "request-validation",
  "errors": [
    "validation: request-source.items[0].unit_price must be number"
  ]
}
```

Status: `400`

This response comes from SchemaBridge. The upstream service was not called.

### `request-target`

The incoming request matched the source schema, but the transformed payload does not match the target schema. This usually means the mapping is incomplete.

Example response:

```json
{
  "stage": "request-validation",
  "errors": [
    "validation: request-target.lineItems is required"
  ]
}
```

Status: `502`

This response comes from SchemaBridge. The upstream service was not called.

## Response Validation Stages

Response validation only runs when the binding has a response mapping.

### `response-source`

The upstream response does not match the response mapping's source schema.

Status: `502`

This response comes from SchemaBridge after the upstream service responds.

### `response-target`

The response mapping ran, but the transformed response does not match the response mapping's target schema.

Status: `502`

This response comes from SchemaBridge after the upstream service responds.

## Upstream Errors

If the bridge successfully validates and transforms the request but cannot reach the receiver, the response uses:

```json
{
  "stage": "upstream",
  "error": "getaddrinfo ENOTFOUND receiver"
}
```

Status: `502`

This is a forwarding failure, not a schema validation failure.

## Recommended Workflow

Use `strict` while creating and testing a binding. Switch to `warn` temporarily if you need to observe real traffic without blocking callers. Use `off` only for routes where SchemaBridge should transform best-effort payloads without enforcing examples.

