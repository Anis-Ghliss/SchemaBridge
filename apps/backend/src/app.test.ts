import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createMemoryPrisma } from "./test-helpers/memoryPrisma";
import { SchemaBridgeRepository } from "./services/repository";

describe("admin api", () => {
  let prisma: ReturnType<typeof createMemoryPrisma>;

  beforeEach(() => {
    prisma = createMemoryPrisma();
  });

  async function createProbeMapping(app: ReturnType<typeof createApp>) {
    const source = await app.inject({
      method: "POST",
      url: "/schemas",
      payload: { name: "Probe source", content: { name: "Ada" } }
    });
    const target = await app.inject({
      method: "POST",
      url: "/schemas",
      payload: { name: "Probe target", content: { customer: { name: "Ada" } } }
    });
    const mapping = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Probe mapping",
        sourceSchemaId: (source.json() as { id: string }).id,
        targetSchemaId: (target.json() as { id: string }).id,
        rules: [{ id: "probe-rule", sourcePath: "name", targetPath: "customer.name" }]
      }
    });
    return (mapping.json() as { id: string }).id;
  }

  it("reports health", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", service: "schema-bridge-api" });
  });

  it("executes transformations", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/transform",
      payload: {
        input: { customerName: "John" },
        rules: [{ id: "1", sourcePath: "customerName", targetPath: "customer.name" }]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "success", output: { customer: { name: "John" } }, errors: [] });
  });

  it("rejects admin requests over the configured body limit", async () => {
    const app = createApp({ prisma: prisma as never, bodyLimitBytes: 16 });
    const response = await app.inject({
      method: "POST",
      url: "/transform",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ input: { value: "too-large" }, rules: [] })
    });
    expect(response.statusCode).toBe(413);
  });

  it("rate limits admin requests by client", async () => {
    const app = createApp({ prisma: prisma as never, rateLimit: { max: 1, windowMs: 60_000 } });
    const first = await app.inject({ method: "GET", url: "/health", remoteAddress: "203.0.113.10" });
    const second = await app.inject({ method: "GET", url: "/health", remoteAddress: "203.0.113.10" });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: "rate limit exceeded" });
  });

  it("updates current mapping rules without creating a new version", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Customer v1 to v2",
        sourceSchemaId: "00000000-0000-4000-8000-000000000001",
        targetSchemaId: "00000000-0000-4000-8000-000000000002",
        rules: []
      }
    });
    expect(created.statusCode).toBe(200);

    const mappingId = (created.json() as { id: string }).id;
    const updated = await app.inject({
      method: "PATCH",
      url: `/mappings/${mappingId}/versions/current`,
      payload: { rules: [{ id: "rule-1", sourcePath: "name", targetPath: "customer.name" }] }
    });
    expect(updated.statusCode).toBe(200);
    const updatedBody = updated.json() as { currentVersion: number; versions: Array<{ rules: unknown[] }> };
    expect(updatedBody.currentVersion).toBe(1);
    expect(updatedBody.versions).toHaveLength(1);
    expect(updatedBody.versions[0].rules).toHaveLength(1);

    const versioned = await app.inject({
      method: "POST",
      url: `/mappings/${mappingId}/versions`,
      payload: { rules: [{ id: "rule-2", sourcePath: "email", targetPath: "customer.email" }] }
    });
    expect(versioned.statusCode).toBe(200);
    const versionedBody = versioned.json() as { currentVersion: number; versions: unknown[] };
    expect(versionedBody.currentVersion).toBe(2);
    expect(versionedBody.versions).toHaveLength(2);
  });

  it("deletes mappings that are not referenced", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Temporary mapping",
        sourceSchemaId: "00000000-0000-4000-8000-000000000001",
        targetSchemaId: "00000000-0000-4000-8000-000000000002",
        rules: []
      }
    });
    const mappingId = (created.json() as { id: string }).id;

    const deleted = await app.inject({ method: "DELETE", url: `/mappings/${mappingId}` });
    expect(deleted.statusCode).toBe(204);

    const listed = await app.inject({ method: "GET", url: "/mappings" });
    expect(listed.json()).toEqual([]);
  });

  it("blocks mapping deletion while a binding references it", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Referenced mapping",
        sourceSchemaId: "00000000-0000-4000-8000-000000000001",
        targetSchemaId: "00000000-0000-4000-8000-000000000002",
        rules: []
      }
    });
    const mappingId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Blocking binding",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId
      }
    });

    const deleted = await app.inject({ method: "DELETE", url: `/mappings/${mappingId}` });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json()).toEqual({ error: "Used by binding \"Blocking binding\"" });
  });

  it("cascade deletes bindings when deleting a referenced mapping", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Cascade mapping",
        sourceSchemaId: "00000000-0000-4000-8000-000000000001",
        targetSchemaId: "00000000-0000-4000-8000-000000000002",
        rules: []
      }
    });
    const mappingId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Binding to cascade",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId
      }
    });

    const deleted = await app.inject({ method: "DELETE", url: `/mappings/${mappingId}?cascade=true` });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/mappings" })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/bindings" })).json()).toEqual([]);
  });

  it("cascade clears response-only binding references when deleting a mapping", async () => {
    const app = createApp({ prisma: prisma as never });
    const requestMapping = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Request mapping",
        sourceSchemaId: "00000000-0000-4000-8000-000000000001",
        targetSchemaId: "00000000-0000-4000-8000-000000000002",
        rules: []
      }
    });
    const responseMapping = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Response mapping",
        sourceSchemaId: "00000000-0000-4000-8000-000000000002",
        targetSchemaId: "00000000-0000-4000-8000-000000000001",
        rules: []
      }
    });
    const requestMappingId = (requestMapping.json() as { id: string }).id;
    const responseMappingId = (responseMapping.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Response-only dependent",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId: requestMappingId,
        responseMappingId
      }
    });

    const deleted = await app.inject({ method: "DELETE", url: `/mappings/${responseMappingId}?cascade=true` });
    expect(deleted.statusCode).toBe(204);
    const bindings = (await app.inject({ method: "GET", url: "/bindings" })).json() as Array<{ responseMappingId: string | null }>;
    expect(bindings).toHaveLength(1);
    expect(bindings[0].responseMappingId).toBeNull();
  });

  it("cascade deletes mappings and bindings when deleting a referenced schema", async () => {
    const app = createApp({ prisma: prisma as never });
    const source = await app.inject({ method: "POST", url: "/schemas", payload: { name: "Source", content: { name: "Ada" } } });
    const target = await app.inject({ method: "POST", url: "/schemas", payload: { name: "Target", content: { customer: { name: "Ada" } } } });
    const sourceId = (source.json() as { id: string }).id;
    const targetId = (target.json() as { id: string }).id;
    const mapping = await app.inject({
      method: "POST",
      url: "/mappings",
      payload: {
        name: "Schema cascade mapping",
        sourceSchemaId: sourceId,
        targetSchemaId: targetId,
        rules: []
      }
    });
    const mappingId = (mapping.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Schema cascade binding",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId
      }
    });

    const blocked = await app.inject({ method: "DELETE", url: `/schemas/${sourceId}` });
    expect(blocked.statusCode).toBe(409);

    const deleted = await app.inject({ method: "DELETE", url: `/schemas/${sourceId}?cascade=true` });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/mappings" })).json()).toEqual([]);
    expect((await app.inject({ method: "GET", url: "/bindings" })).json()).toEqual([]);
  });

  it("creates, lists, updates, and deletes proxy bindings", async () => {
    const app = createApp({ prisma: prisma as never });

    const created = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Customer v1 to v2",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId: "00000000-0000-4000-8000-000000000010"
      }
    });
    expect(created.statusCode).toBe(200);
    const createdBody = created.json() as { id: string; enabled: boolean; forwardHeaders: string[] };
    expect(createdBody.enabled).toBe(true);
    expect(createdBody.forwardHeaders.length).toBeGreaterThan(0);

    const listed = await app.inject({ method: "GET", url: "/bindings" });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as unknown[]).length).toBe(1);

    const updated = await app.inject({
      method: "PATCH",
      url: `/bindings/${createdBody.id}`,
      payload: { enabled: false }
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { enabled: boolean }).enabled).toBe(false);

    const deleted = await app.inject({ method: "DELETE", url: `/bindings/${createdBody.id}` });
    expect(deleted.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: "GET", url: "/bindings" });
    expect(afterDelete.json()).toEqual([]);
  });

  it("probes a binding as an app without requiring the plaintext app key", async () => {
    const app = createApp({ prisma: prisma as never });
    const mappingId = await createProbeMapping(app);
    const binding = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Probe binding",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://127.0.0.1:9",
        mappingId
      }
    });
    const bindingId = (binding.json() as { id: string }).id;
    const proxyApp = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "probe-app", scope: "selected", bindingIds: [bindingId] }
    });
    const appId = (proxyApp.json() as { id: string }).id;

    const response = await app.inject({
      method: "POST",
      url: `/bindings/${bindingId}/probe`,
      payload: { appId, input: { name: "Ada" } }
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: number }).status).toBe(502);
  });

  it("blocks binding probes when the selected app scope excludes the binding", async () => {
    const app = createApp({ prisma: prisma as never });
    const mappingId = await createProbeMapping(app);
    const binding = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Excluded probe binding",
        method: "POST",
        pathPattern: "/customers",
        upstreamBaseUrl: "http://127.0.0.1:9",
        mappingId
      }
    });
    const bindingId = (binding.json() as { id: string }).id;
    const proxyApp = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "blocked-probe-app", scope: "selected", bindingIds: [] }
    });
    const appId = (proxyApp.json() as { id: string }).id;

    const response = await app.inject({
      method: "POST",
      url: `/bindings/${bindingId}/probe`,
      payload: { appId, input: { name: "Ada" } }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "api key not authorized for this binding" });
  });

  it("rejects bindings whose upstream targets a cloud-metadata address", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "ssrf",
        method: "POST",
        pathPattern: "/x",
        upstreamBaseUrl: "http://169.254.169.254/latest/meta-data/",
        mappingId: "00000000-0000-4000-8000-000000000010"
      }
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects bindings whose upstream uses a non-http scheme", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "bad-scheme",
        method: "POST",
        pathPattern: "/x",
        upstreamBaseUrl: "ftp://internal/file",
        mappingId: "00000000-0000-4000-8000-000000000010"
      }
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects invalid binding payloads", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: { name: "broken", method: "POST" }
    });
    expect(response.statusCode).toBe(400);
  });

  it("accepts HEAD as a proxy binding method", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: {
        name: "Customer head check",
        method: "HEAD",
        pathPattern: "/customers/:id",
        upstreamBaseUrl: "http://service-b:8080",
        mappingId: "00000000-0000-4000-8000-000000000010"
      }
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { method: string }).method).toBe("HEAD");
  });

  it("deletes proxy request logs older than a cutoff", async () => {
    const repository = new SchemaBridgeRepository(prisma as never);
    await repository.recordProxyRequest({ bindingId: null, method: "GET", path: "/old", statusCode: 404, durationMs: 1, errors: [] });
    await repository.recordProxyRequest({ bindingId: null, method: "GET", path: "/new", statusCode: 404, durationMs: 1, errors: [] });
    const logs = await repository.listProxyRequests({ limit: 10 });
    const oldLog = logs.find((log) => log.path === "/old");
    expect(oldLog).toBeDefined();

    const deleted = await repository.deleteProxyRequestsOlderThan(new Date(Date.now() + 1));
    expect(deleted).toBe(2);
    await repository.recordProxyRequest({ bindingId: null, method: "GET", path: "/after", statusCode: 404, durationMs: 1, errors: [] });
    expect(await repository.listProxyRequests({ limit: 10 })).toHaveLength(1);
  });

  it("creates an app and reveals the key once", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({
      method: "POST",
      url: "/apps",
      payload: { name: "service-a", scope: "all" }
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as { id: string; key: string; keyPrefix: string };
    expect(body.key.startsWith("sb_")).toBe(true);
    expect(body.keyPrefix.startsWith("sb_")).toBe(true);

    const listed = await app.inject({ method: "GET", url: "/apps" });
    const apps = listed.json() as Array<Record<string, unknown>>;
    expect(apps).toHaveLength(1);
    expect(apps[0].key).toBeUndefined();
  });

  it("rotates an app key with a fresh plaintext", async () => {
    const app = createApp({ prisma: prisma as never });
    const created = await app.inject({ method: "POST", url: "/apps", payload: { name: "rotator" } });
    const original = (created.json() as { key: string }).key;
    const rotated = await app.inject({ method: "POST", url: `/apps/${(created.json() as { id: string }).id}/rotate` });
    expect(rotated.statusCode).toBe(200);
    const rotatedBody = rotated.json() as { key: string };
    expect(rotatedBody.key).not.toBe(original);
    expect(rotatedBody.key.startsWith("sb_")).toBe(true);
  });

  describe("with ADMIN_API_KEY set", () => {
    it("rejects API requests without a token", async () => {
      const app = createApp({ prisma: prisma as never, adminApiKey: "s3cret" });
      const response = await app.inject({ method: "GET", url: "/bindings" });
      expect(response.statusCode).toBe(401);
    });

    it("rejects API requests with a wrong token", async () => {
      const app = createApp({ prisma: prisma as never, adminApiKey: "s3cret" });
      const response = await app.inject({ method: "GET", url: "/bindings", headers: { authorization: "Bearer nope" } });
      expect(response.statusCode).toBe(401);
    });

    it("accepts API requests with the correct token", async () => {
      const app = createApp({ prisma: prisma as never, adminApiKey: "s3cret" });
      const response = await app.inject({ method: "GET", url: "/bindings", headers: { authorization: "Bearer s3cret" } });
      expect(response.statusCode).toBe(200);
    });

    it("leaves the health check public", async () => {
      const app = createApp({ prisma: prisma as never, adminApiKey: "s3cret" });
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    });
  });
});
