import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent } from "undici";
import { createProxyApp } from "./proxyApp";
import { createMemoryPrisma, type MemoryPrisma } from "./test-helpers/memoryPrisma";
import { generateApiKey } from "./services/authService";

const SCHEMA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";
const SCHEMA_TARGET_ID = "00000000-0000-4000-8000-000000000002";
const MAPPING_REQUEST_ID = "00000000-0000-4000-8000-0000000000a1";
const MAPPING_RESPONSE_ID = "00000000-0000-4000-8000-0000000000a2";
const BINDING_ID = "00000000-0000-4000-8000-0000000000b1";
const ORDER_SOURCE_SCHEMA_ID = "00000000-0000-4000-8000-000000000011";
const ORDER_TARGET_SCHEMA_ID = "00000000-0000-4000-8000-000000000012";
const ORDER_MAPPING_ID = "00000000-0000-4000-8000-0000000000a3";
const ACK_SOURCE_SCHEMA_ID = "00000000-0000-4000-8000-000000000021";
const ACK_TARGET_SCHEMA_ID = "00000000-0000-4000-8000-000000000022";
const ACK_MAPPING_ID = "00000000-0000-4000-8000-0000000000a4";

function seedRequestMapping(prisma: MemoryPrisma): void {
  prisma.seed.schema({ id: SCHEMA_SOURCE_ID, name: "Customer v1", content: { customerName: "Ada", customerEmail: "ada@example.com" }, fields: [] });
  prisma.seed.schema({ id: SCHEMA_TARGET_ID, name: "Customer v2", content: { customer: { name: "Ada", email: "ada@example.com" } }, fields: [] });
  prisma.seed.mapping({
    id: MAPPING_REQUEST_ID,
    name: "v1 to v2 request",
    sourceSchemaId: SCHEMA_SOURCE_ID,
    targetSchemaId: SCHEMA_TARGET_ID,
    currentVersion: 1,
    rules: [
      { id: "r1", sourcePath: "customerName", targetPath: "customer.name" },
      { id: "r2", sourcePath: "customerEmail", targetPath: "customer.email" }
    ]
  });
}

function seedResponseMapping(prisma: MemoryPrisma): void {
  prisma.seed.mapping({
    id: MAPPING_RESPONSE_ID,
    name: "v2 to v1 response",
    sourceSchemaId: SCHEMA_TARGET_ID,
    targetSchemaId: SCHEMA_SOURCE_ID,
    currentVersion: 1,
    rules: [
      { id: "r1", sourcePath: "customer.id", targetPath: "customerId" },
      { id: "r2", sourcePath: "customer.name", targetPath: "customerName" }
    ]
  });
}

function seedOrderMapping(prisma: MemoryPrisma): void {
  prisma.seed.schema({
    id: ORDER_SOURCE_SCHEMA_ID,
    name: "Order v1",
    content: {
      order_id: "ord-1234",
      items: [{ sku: "BOOK-001", qty: 2, unit_price: 19.99 }],
      total_amount: 43.48
    },
    fields: []
  });
  prisma.seed.schema({
    id: ORDER_TARGET_SCHEMA_ID,
    name: "Order v2",
    content: {
      orderId: "ord-1234",
      lineItems: [{ sku: "BOOK-001", qty: 2, unitPrice: 19.99 }],
      totals: { amount: 43.48 }
    },
    fields: []
  });
  prisma.seed.mapping({
    id: ORDER_MAPPING_ID,
    name: "order v1 to v2 request",
    sourceSchemaId: ORDER_SOURCE_SCHEMA_ID,
    targetSchemaId: ORDER_TARGET_SCHEMA_ID,
    currentVersion: 1,
    rules: [
      { id: "r1", sourcePath: "order_id", targetPath: "orderId" },
      { id: "r2", sourcePath: "items[].sku", targetPath: "lineItems[].sku" },
      { id: "r3", sourcePath: "items[].qty", targetPath: "lineItems[].qty" },
      { id: "r4", sourcePath: "items[].unit_price", targetPath: "lineItems[].unitPrice" },
      { id: "r5", sourcePath: "total_amount", targetPath: "totals.amount" }
    ]
  });
}

function seedAckResponseMapping(prisma: MemoryPrisma): void {
  prisma.seed.schema({
    id: ACK_SOURCE_SCHEMA_ID,
    name: "Ack upstream",
    content: { result: { id: "c-1", accepted: true } },
    fields: []
  });
  prisma.seed.schema({
    id: ACK_TARGET_SCHEMA_ID,
    name: "Ack public",
    content: { customerId: "c-1", accepted: true },
    fields: []
  });
  prisma.seed.mapping({
    id: ACK_MAPPING_ID,
    name: "ack response",
    sourceSchemaId: ACK_SOURCE_SCHEMA_ID,
    targetSchemaId: ACK_TARGET_SCHEMA_ID,
    currentVersion: 1,
    rules: [
      { id: "r1", sourcePath: "result.id", targetPath: "customerId" },
      { id: "r2", sourcePath: "result.accepted", targetPath: "accepted" }
    ]
  });
}

describe("proxy app", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  it("returns 404 when no binding matches", async () => {
    const prisma = createMemoryPrisma();
    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({ method: "POST", url: "/no-such-route" });
    expect(response.statusCode).toBe(404);
  });

  it("rejects proxy requests over the configured body limit", async () => {
    const prisma = createMemoryPrisma();
    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, bodyLimitBytes: 16 });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ value: "too-large" })
    });
    expect(response.statusCode).toBe(413);
  });

  it("rate limits proxy requests by client", async () => {
    const prisma = createMemoryPrisma();
    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, rateLimit: { max: 1, windowMs: 60_000 } });
    const first = await app.inject({ method: "GET", url: "/no-such-route", remoteAddress: "203.0.113.20" });
    const second = await app.inject({ method: "GET", url: "/no-such-route", remoteAddress: "203.0.113.20" });
    expect(first.statusCode).toBe(404);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "rate limit exceeded" });
  });

  it("transforms request and forwards to upstream", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    let receivedBody: string | undefined;
    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply((opts) => {
      receivedBody = typeof opts.body === "string" ? opts.body : String(opts.body);
      return { statusCode: 201, data: { id: "c-1", status: "created" }, responseOptions: { headers: { "content-type": "application/json" } } };
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "c-1", status: "created" });
    expect(receivedBody).toBeDefined();
    expect(JSON.parse(receivedBody as string)).toEqual({ customer: { name: "Ada", email: "ada@example.com" } });
  });

  it("does not forward the bridge Authorization header upstream", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      // Even when a binding explicitly lists authorization, the credential used
      // to authenticate to the bridge must never reach the upstream.
      forwardHeaders: ["content-type", "authorization"],
      enabled: true
    });
    const generated = generateApiKey();
    prisma.seed.app({
      id: "00000000-0000-4000-8000-0000000000c9",
      name: "leaky",
      description: null,
      keyHash: generated.hash,
      keyPrefix: generated.prefix,
      scope: "all",
      bindingIds: [],
      enabled: true
    });

    let receivedAuth: string | string[] | undefined = "unset";
    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply((opts) => {
      receivedAuth = (opts.headers as Record<string, string | string[] | undefined>)?.authorization;
      return { statusCode: 201, data: { ok: true }, responseOptions: { headers: { "content-type": "application/json" } } };
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { authorization: `Bearer ${generated.plaintext}`, "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });

    expect(response.statusCode).toBe(201);
    expect(receivedAuth).toBeUndefined();
  });

  it("blocks forwarding to a cloud-metadata upstream", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "metadata",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://169.254.169.254",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });

    expect(response.statusCode).toBe(502);
    expect((response.json() as { error: string }).error).toBe("upstream destination is not permitted");
  });

  it("omits request bodies from the log when capture is disabled", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { ok: true }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, captureBodies: false });
    await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });
    await new Promise((resolve) => setImmediate(resolve));

    // Bodies are stored as JSON null (no payload content persisted).
    const logs = await prisma.proxyRequestLog.findMany();
    expect(JSON.stringify(logs[0]?.incomingRequest ?? null)).not.toContain("Ada");
    expect(JSON.stringify(logs[0]?.transformedRequest ?? null)).not.toContain("Ada");
    expect(JSON.stringify(logs[0]?.responseBody ?? null)).not.toContain("ok");
  });

  it("records contract drift when inbound traffic carries an unexpected field", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "off",
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { ok: true }, { headers: { "content-type": "application/json" } }).persist();

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const send = () => app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com", loyaltyTier: "gold" }
    });

    await send();
    await send();
    await new Promise((resolve) => setImmediate(resolve));

    const events = await prisma.driftEvent.findMany();
    const added = events.find((event) => event.kind === "added" && event.path === "loyaltyTier");
    expect(added).toBeDefined();
    expect(added?.stage).toBe("request-source");
    expect(added?.observedType).toBe("string");
    expect(added?.count).toBe(2);
  });

  it("does not record drift when drift sampling is disabled", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { ok: true }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, driftSampleRate: 0 });
    await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com", extra: 1 }
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(await prisma.driftEvent.findMany()).toHaveLength(0);
  });

  it("applies response mapping when configured", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    seedResponseMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: MAPPING_RESPONSE_ID,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { customer: { id: "c-1", name: "Ada" } }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ customerId: "c-1", customerName: "Ada" });
  });

  it("rejects requests when binding is disabled", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: false
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({ method: "POST", url: "/customers", payload: {} });
    expect(response.statusCode).toBe(404);
  });

  it("matches path parameters", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "customer-by-id",
      method: "GET",
      pathPattern: "/customers/:id",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers/42", method: "GET" }).reply(200, { ok: true }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({ method: "GET", url: "/customers/42" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("rejects invalid inbound payloads when validation is strict", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "strict-customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "strict",
      enabled: true
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      stage: "request-validation",
      errors: ["validation: request-source.customerEmail is required"]
    });
  });

  it("forwards and records validation errors when validation warns", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "warn-customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "warn",
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(202, { accepted: true }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada" }
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.statusCode).toBe(202);
    const logs = await prisma.proxyRequestLog.findMany();
    expect(logs[0]?.incomingRequest).toEqual({ customerName: "Ada" });
    expect(logs[0]?.errors).toEqual([
      "validation: request-source.customerEmail is required",
      "validation: request-target.customer.email is required"
    ]);
  });

  it("ignores schema validation when validation is off", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "unvalidated-customers",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "off",
      enabled: true
    });

    let receivedBody: string | undefined;
    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply((opts) => {
      receivedBody = typeof opts.body === "string" ? opts.body : String(opts.body);
      return { statusCode: 202, data: { accepted: true }, responseOptions: { headers: { "content-type": "application/json" } } };
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada" }
    });

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(receivedBody as string)).toEqual({ customer: { name: "Ada" } });
  });

  it("rejects invalid array item types during strict request-source validation", async () => {
    const prisma = createMemoryPrisma();
    seedOrderMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "strict-orders",
      method: "POST",
      pathPattern: "/orders",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: ORDER_MAPPING_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "strict",
      enabled: true
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { "content-type": "application/json" },
      payload: { order_id: "ord-1234", items: [{ sku: "BOOK-001", qty: 2, unit_price: "19.99" }], total_amount: 43.48 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      stage: "request-validation",
      errors: ["validation: request-source.items[0].unit_price must be number"]
    });
  });

  it("rejects transformed payloads that do not satisfy the target schema in strict mode", async () => {
    const prisma = createMemoryPrisma();
    seedOrderMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "strict-orders-target",
      method: "POST",
      pathPattern: "/orders",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: ORDER_MAPPING_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "strict",
      enabled: true
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { "content-type": "application/json" },
      payload: { order_id: "ord-1234", items: [], total_amount: 43.48 }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      stage: "request-validation",
      errors: ["validation: request-target.lineItems is required"]
    });
  });

  it("records transformed payloads for strict validation failures after mapping", async () => {
    const prisma = createMemoryPrisma();
    seedOrderMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "logged-target-failure",
      method: "POST",
      pathPattern: "/orders",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: ORDER_MAPPING_ID,
      responseMappingId: null,
      forwardHeaders: ["content-type"],
      validationMode: "strict",
      enabled: true
    });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    await app.inject({
      method: "POST",
      url: "/orders",
      headers: { "content-type": "application/json" },
      payload: { order_id: "ord-1234", items: [], total_amount: 43.48 }
    });
    await new Promise((resolve) => setImmediate(resolve));

    const logs = await prisma.proxyRequestLog.findMany();
    expect(logs[0]?.statusCode).toBe(502);
    expect(logs[0]?.transformedRequest).toEqual({ orderId: "ord-1234", totals: { amount: 43.48 } });
    expect(logs[0]?.errors).toEqual(["validation: request-target.lineItems is required"]);
  });

  it("rejects invalid upstream response payloads during strict response-source validation", async () => {
    const prisma = createMemoryPrisma();
    seedRequestMapping(prisma);
    seedAckResponseMapping(prisma);
    prisma.seed.binding({
      id: BINDING_ID,
      name: "strict-response",
      method: "POST",
      pathPattern: "/customers",
      upstreamBaseUrl: "http://service-b.local",
      mappingId: MAPPING_REQUEST_ID,
      responseMappingId: ACK_MAPPING_ID,
      forwardHeaders: ["content-type"],
      validationMode: "strict",
      enabled: true
    });

    agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { result: { id: "c-1", accepted: "yes" } }, { headers: { "content-type": "application/json" } });

    const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent });
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      headers: { "content-type": "application/json" },
      payload: { customerName: "Ada", customerEmail: "ada@example.com" }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      stage: "response-validation",
      errors: ["validation: response-source.result.accepted must be boolean"]
    });
  });

  describe("with PROXY_REQUIRE_AUTH", () => {
    const APP_ID = "00000000-0000-4000-8000-0000000000c1";
    const OTHER_BINDING_ID = "00000000-0000-4000-8000-0000000000b2";

    function seedFullBinding(prisma: MemoryPrisma): void {
      seedRequestMapping(prisma);
      prisma.seed.binding({
        id: BINDING_ID,
        name: "customers",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b.local",
        mappingId: MAPPING_REQUEST_ID,
        responseMappingId: null,
        forwardHeaders: ["content-type"],
        enabled: true
      });
    }

    it("returns 401 when no Authorization header is sent", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({ method: "POST", url: "/customers", payload: {} });
      expect(response.statusCode).toBe(401);
    });

    it("returns 401 for an unknown key", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({ method: "POST", url: "/customers", headers: { authorization: "Bearer sb_notreal" }, payload: {} });
      expect(response.statusCode).toBe(401);
    });

    it("returns 403 when the app is disabled", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const generated = generateApiKey();
      prisma.seed.app({
        id: APP_ID,
        name: "disabled-app",
        description: null,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scope: "all",
        bindingIds: [],
        enabled: false
      });
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({ method: "POST", url: "/customers", headers: { authorization: `Bearer ${generated.plaintext}` }, payload: {} });
      expect(response.statusCode).toBe(403);
    });

    it("returns 403 when key scope excludes the matched binding", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const generated = generateApiKey();
      prisma.seed.app({
        id: APP_ID,
        name: "scoped-app",
        description: null,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scope: "selected",
        bindingIds: [OTHER_BINDING_ID],
        enabled: true
      });
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({ method: "POST", url: "/customers", headers: { authorization: `Bearer ${generated.plaintext}` }, payload: {} });
      expect(response.statusCode).toBe(403);
    });

    it("forwards when key has scope=all", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const generated = generateApiKey();
      prisma.seed.app({
        id: APP_ID,
        name: "all-app",
        description: null,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scope: "all",
        bindingIds: [],
        enabled: true
      });
      agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { ok: true }, { headers: { "content-type": "application/json" } });
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({
        method: "POST",
        url: "/customers",
        headers: { authorization: `Bearer ${generated.plaintext}`, "content-type": "application/json" },
        payload: { customerName: "Ada", customerEmail: "ada@example.com" }
      });
      expect(response.statusCode).toBe(201);
    });

    it("forwards when scope=selected includes the matched binding", async () => {
      const prisma = createMemoryPrisma();
      seedFullBinding(prisma);
      const generated = generateApiKey();
      prisma.seed.app({
        id: APP_ID,
        name: "scoped-allow-app",
        description: null,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scope: "selected",
        bindingIds: [BINDING_ID],
        enabled: true
      });
      agent.get("http://service-b.local").intercept({ path: "/customers", method: "POST" }).reply(201, { ok: true }, { headers: { "content-type": "application/json" } });
      const { app } = await createProxyApp({ prisma: prisma as never, dispatcher: agent, requireAuth: true });
      const response = await app.inject({
        method: "POST",
        url: "/customers",
        headers: { authorization: `Bearer ${generated.plaintext}`, "content-type": "application/json" },
        payload: { customerName: "Ada", customerEmail: "ada@example.com" }
      });
      expect(response.statusCode).toBe(201);
    });
  });
});
