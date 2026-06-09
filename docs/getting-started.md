# Getting Started

This guide starts from a blank database and creates one real proxy route.

## 1. Start SchemaBridge

```bash
docker compose up --build
```

Open the admin UI at <http://localhost:4000>. The runtime proxy listens on <http://localhost:8080>.

## 2. Create A Source Schema

Open **Schemas**, create a schema named `Order v1`, and paste an example payload from the service that sends requests to SchemaBridge:

```json
{
  "order_id": "ord-1234",
  "customer_name": "Ada Lovelace",
  "customer_email": "ada@example.com",
  "items": [
    {
      "sku": "BOOK-001",
      "qty": 2,
      "unit_price": 19.99
    }
  ],
  "total_amount": 43.48,
  "placed_at": "2026-06-08T10:00:00Z"
}
```

## 3. Create A Target Schema

Create a second schema named `Order v2` with the shape your receiving service expects:

```json
{
  "orderId": "ord-1234",
  "customer": {
    "name": "Ada Lovelace",
    "email": "ada@example.com"
  },
  "lineItems": [
    {
      "sku": "BOOK-001",
      "qty": 2,
      "unitPrice": 19.99
    }
  ],
  "totals": {
    "amount": 43.48
  },
  "placedAt": "2026-06-08T10:00:00Z"
}
```

## 4. Create A Mapping

Open **Mappings**, create a mapping from `Order v1` to `Order v2`, then connect the fields explicitly:

| Source | Target |
| --- | --- |
| `order_id` | `orderId` |
| `customer_name` | `customer.name` |
| `customer_email` | `customer.email` |
| `items[].sku` | `lineItems[].sku` |
| `items[].qty` | `lineItems[].qty` |
| `items[].unit_price` | `lineItems[].unitPrice` |
| `total_amount` | `totals.amount` |
| `placed_at` | `placedAt` |

Save the mapping.

## 5. Create A Binding

Open **Bindings** and create a binding:

| Field | Value |
| --- | --- |
| Binding name | `orders-v1-to-v2` |
| Incoming request method | `POST` |
| Incoming request path | `/orders` |
| Forward to service URL | The base URL of the receiving service, for example `http://receiver:8082` |
| Request body mapping | The mapping you created |
| Payload validation | Start with `strict` while testing |

The sender now calls SchemaBridge at `POST http://localhost:8080/orders`. SchemaBridge transforms the body and forwards it to the receiver at `<service URL>/orders`.

## 6. Try It

Open the binding details and use **Try it**.

The left side is the request as the sender provides it. The right side shows the transformed request before it is sent upstream. If validation blocks the request, the response tells you whether the failure happened before mapping, after mapping, or while validating the upstream response.

## 7. Send With Curl

If `PROXY_REQUIRE_AUTH=false`:

```bash
curl -X POST http://localhost:8080/orders \
  -H 'content-type: application/json' \
  -d '{
    "order_id": "ord-1234",
    "customer_name": "Ada Lovelace",
    "customer_email": "ada@example.com",
    "items": [{ "sku": "BOOK-001", "qty": 2, "unit_price": 19.99 }],
    "total_amount": 43.48,
    "placed_at": "2026-06-08T10:00:00Z"
  }'
```

If `PROXY_REQUIRE_AUTH=true`, create an app in **Apps** and include its key:

```bash
curl -X POST http://localhost:8080/orders \
  -H 'authorization: Bearer sb_yourKeyHere' \
  -H 'content-type: application/json' \
  -d '{
    "order_id": "ord-1234",
    "customer_name": "Ada Lovelace",
    "customer_email": "ada@example.com",
    "items": [{ "sku": "BOOK-001", "qty": 2, "unit_price": 19.99 }],
    "total_amount": 43.48,
    "placed_at": "2026-06-08T10:00:00Z"
  }'
```

## 8. Verify Traffic

Open **Live** and inspect:

- incoming request
- transformed request
- upstream status
- response body
- validation errors, if any

