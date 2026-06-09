import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent } from "undici";
import { ControlPlaneReporter } from "./controlPlaneReporter";
import { SchemaBridgeRepository } from "./repository";
import { createMemoryPrisma } from "../test-helpers/memoryPrisma";

const BINDING_ID = "00000000-0000-4000-8000-0000000000e1";
const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

function makeReporter(repository: SchemaBridgeRepository, agent: MockAgent, overrides: Partial<ConstructorParameters<typeof ControlPlaneReporter>[1]> = {}) {
  return new ControlPlaneReporter(repository, {
    url: "http://control.local",
    token: "cp_secret",
    instanceId: "bridge-a",
    bridgeVersion: "0.1.6",
    dispatcher: agent,
    now: () => FIXED_NOW,
    ...overrides
  });
}

describe("control plane reporter", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  it("posts a drift snapshot to the control plane ingest endpoint", async () => {
    const prisma = createMemoryPrisma();
    const repository = new SchemaBridgeRepository(prisma as never);
    await repository.recordDriftFindings(BINDING_ID, "response-source", [
      { kind: "added", path: "newField", observedType: "string" }
    ]);

    let receivedBody: string | undefined;
    let receivedAuth: string | string[] | undefined;
    agent.get("http://control.local").intercept({ path: "/ingest/drift", method: "POST" }).reply((opts) => {
      receivedBody = typeof opts.body === "string" ? opts.body : String(opts.body);
      receivedAuth = (opts.headers as Record<string, string | string[] | undefined>)?.authorization;
      return { statusCode: 202, data: { accepted: true } };
    });

    const result = await makeReporter(repository, agent).flushOnce();

    expect(result).toEqual({ status: "sent", count: 1 });
    expect(receivedAuth).toBe("Bearer cp_secret");
    const payload = JSON.parse(receivedBody as string) as Record<string, unknown>;
    expect(payload.instanceId).toBe("bridge-a");
    expect(payload.bridgeVersion).toBe("0.1.6");
    expect(payload.reportedAt).toBe(FIXED_NOW.toISOString());
    const events = payload.events as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ bindingId: BINDING_ID, stage: "response-source", kind: "added", path: "newField", observedType: "string", count: 1 });
  });

  it("skips reporting when there is no drift", async () => {
    const prisma = createMemoryPrisma();
    const repository = new SchemaBridgeRepository(prisma as never);
    // disableNetConnect would throw if any HTTP call were attempted.
    const result = await makeReporter(repository, agent).flushOnce();
    expect(result).toEqual({ status: "skipped" });
  });

  it("omits the Authorization header when no token is configured", async () => {
    const prisma = createMemoryPrisma();
    const repository = new SchemaBridgeRepository(prisma as never);
    await repository.recordDriftFindings(BINDING_ID, "request-source", [{ kind: "missing", path: "email", expectedType: "string" }]);

    let receivedAuth: string | string[] | undefined = "unset";
    agent.get("http://control.local").intercept({ path: "/ingest/drift", method: "POST" }).reply((opts) => {
      receivedAuth = (opts.headers as Record<string, string | string[] | undefined>)?.authorization;
      return { statusCode: 202, data: {} };
    });

    await makeReporter(repository, agent, { token: undefined }).flushOnce();
    expect(receivedAuth).toBeUndefined();
  });

  it("throws when the control plane rejects the report", async () => {
    const prisma = createMemoryPrisma();
    const repository = new SchemaBridgeRepository(prisma as never);
    await repository.recordDriftFindings(BINDING_ID, "request-source", [{ kind: "added", path: "x", observedType: "number" }]);

    agent.get("http://control.local").intercept({ path: "/ingest/drift", method: "POST" }).reply(500, { error: "boom" });

    await expect(makeReporter(repository, agent).flushOnce()).rejects.toThrow(/control plane responded 500/);
  });
});
