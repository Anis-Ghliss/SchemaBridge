import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent } from "undici";
import { createApp } from "./app";
import { createProxyApp } from "./proxyApp";
import { createMemoryPrisma } from "./test-helpers/memoryPrisma";

const sourceOrder = {
  items: [{ qty: 2, sku: "BOOK-001", unit_price: 19.99 }],
  order_id: "ord-1234",
  placed_at: "2026-06-08T10:00:00Z",
  total_amount: 43.48,
  customer_name: "Ada Lovelace",
  customer_email: "ada@example.com"
};

const targetOrder = {
  orderId: "ord-1234",
  customer: { name: "Ada Lovelace", email: "ada@example.com" },
  lineItems: [{ sku: "BOOK-001", qty: 2, unit_price: 19.99 }],
  totals: { amount: 43.48 },
  placedAt: "2026-06-08T10:00:00Z"
};

async function configureOrderBridge(admin: ReturnType<typeof createApp>) {
  const sourceSchema = await admin.inject({ method: "POST", url: "/schemas", payload: { name: "Order v1", content: sourceOrder } });
  const targetSchema = await admin.inject({ method: "POST", url: "/schemas", payload: { name: "Order v2", content: targetOrder } });
  expect(sourceSchema.statusCode).toBe(200);
  expect(targetSchema.statusCode).toBe(200);

  const mapping = await admin.inject({
    method: "POST",
    url: "/mappings",
    payload: {
      name: "Order v1 -> v2",
      sourceSchemaId: (sourceSchema.json() as { id: string }).id,
      targetSchemaId: (targetSchema.json() as { id: string }).id,
      rules: [
        { id: "order-id", sourcePath: "order_id", targetPath: "orderId" },
        { id: "customer-name", sourcePath: "customer_name", targetPath: "customer.name" },
        { id: "customer-email", sourcePath: "customer_email", targetPath: "customer.email" },
        { id: "item-sku", sourcePath: "items[].sku", targetPath: "lineItems[].sku" },
        { id: "item-qty", sourcePath: "items[].qty", targetPath: "lineItems[].qty" },
        { id: "item-price", sourcePath: "items[].unit_price", targetPath: "lineItems[].unit_price" },
        { id: "total", sourcePath: "total_amount", targetPath: "totals.amount" },
        { id: "placed", sourcePath: "placed_at", targetPath: "placedAt" }
      ]
    }
  });
  expect(mapping.statusCode).toBe(200);

  const binding = await admin.inject({
    method: "POST",
    url: "/bindings",
    payload: {
      name: "Orders receiver",
      method: "POST",
      pathPattern: "/orders",
      upstreamBaseUrl: "http://receiver.local",
      mappingId: (mapping.json() as { id: string }).id,
      validationMode: "strict"
    }
  });
  expect(binding.statusCode).toBe(200);

  const proxyApp = await admin.inject({
    method: "POST",
    url: "/apps",
    payload: { name: "local-sender", scope: "selected", bindingIds: [(binding.json() as { id: string }).id] }
  });
  expect(proxyApp.statusCode).toBe(200);

  return { apiKey: (proxyApp.json() as { key: string }).key };
}

describe("real scenario smoke", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  it("creates schemas, mapping, binding, and app, then forwards the transformed payload to the receiver", async () => {
    const prisma = createMemoryPrisma();
    const admin = createApp({ prisma: prisma as never });
    const { apiKey } = await configureOrderBridge(admin);

    let receivedBody: string | undefined;
    agent.get("http://receiver.local").intercept({ path: "/orders", method: "POST" }).reply((options) => {
      receivedBody = typeof options.body === "string" ? options.body : String(options.body);
      return { statusCode: 201, data: { accepted: true }, responseOptions: { headers: { "content-type": "application/json" } } };
    });

    const { app: proxy } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
    const response = await proxy.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      payload: sourceOrder
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ accepted: true });
    expect(receivedBody).toBeDefined();
    expect(JSON.parse(receivedBody as string)).toEqual(targetOrder);
    const logs = await prisma.proxyRequestLog.findMany();
    expect(logs[0]?.incomingRequest).toEqual(sourceOrder);
    expect(logs[0]?.transformedRequest).toEqual(targetOrder);
  });

  it("rejects invalid source payloads before contacting the receiver when validation is strict", async () => {
    const prisma = createMemoryPrisma();
    const admin = createApp({ prisma: prisma as never });
    const { apiKey } = await configureOrderBridge(admin);
    const invalidOrder = { ...sourceOrder, items: [{ qty: 2, sku: "BOOK-001" }] };

    const { app: proxy } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
    const response = await proxy.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      payload: invalidOrder
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      stage: "request-validation",
      errors: ["validation: request-source.items[0].unit_price is required"]
    });
    const logs = await prisma.proxyRequestLog.findMany();
    expect(logs[0]?.incomingRequest).toEqual(invalidOrder);
  });
});
