# Concepts

SchemaBridge has five core concepts.

## Schema

A schema is an example JSON payload saved by the user. SchemaBridge derives a field tree and lightweight validation rules from that example.

Source schemas describe what the sender sends. Target schemas describe what the receiver expects.

## Mapping

A mapping connects one source schema to one target schema. It contains field-level rules such as:

```text
customer_name -> customer.name
items[].unit_price -> lineItems[].unitPrice
```

Mappings are versioned. Editing the current version changes what live bindings use immediately. Creating a new version is explicit.

## Binding

A binding is the runtime route that SchemaBridge serves. It answers the question:

```text
When a request arrives here, which mapping should run, and where should the transformed request be sent?
```

A binding includes:

- incoming method, such as `POST`
- incoming path, such as `/orders`
- upstream service base URL, such as `http://receiver:8082`
- request mapping
- optional response mapping
- validation mode
- enabled/disabled state

If a sender calls `POST /orders`, SchemaBridge finds the matching binding, transforms the request body, and forwards it to the upstream URL plus the same path.

## App

An app represents a caller that is allowed to send traffic through the proxy when `PROXY_REQUIRE_AUTH=true`.

Each app has one active API key at a time. The full key is shown only when it is created or rotated. SchemaBridge stores only a hash, so it can validate keys without being able to reveal old plaintext keys.

Apps can access all bindings or only selected bindings.

## Live Traffic

Live traffic is the request log for proxied calls. It records:

- caller app, when auth is enabled
- matched binding
- incoming request body
- transformed request body
- upstream URL
- response body
- validation or upstream errors

Bodies are truncated before storage to avoid unbounded database growth.

## Dependency Rules

Resources are protected from accidental deletion:

- a schema used by a mapping cannot be deleted unless cascade delete is requested
- a mapping used by a binding cannot be deleted unless cascade delete is requested
- deleting a request mapping with cascade deletes bindings that depend on it
- deleting a response-only mapping with cascade clears that optional response mapping from bindings

