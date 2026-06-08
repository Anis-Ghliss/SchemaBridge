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

function seedRequestMapping(prisma: MemoryPrisma): void {
  prisma.seed.schema({ id: SCHEMA_SOURCE_ID, name: "Customer v1", content: {}, fields: [] });
  prisma.seed.schema({ id: SCHEMA_TARGET_ID, name: "Customer v2", content: {}, fields: [] });
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
