import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createMemoryPrisma } from "./test-helpers/memoryPrisma";

describe("admin api", () => {
  let prisma: ReturnType<typeof createMemoryPrisma>;

  beforeEach(() => {
    prisma = createMemoryPrisma();
  });

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

  it("rejects invalid binding payloads", async () => {
    const app = createApp({ prisma: prisma as never });
    const response = await app.inject({
      method: "POST",
      url: "/bindings",
      payload: { name: "broken", method: "POST" }
    });
    expect(response.statusCode).toBe(400);
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
});
