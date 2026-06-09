import { beforeEach, describe, expect, it } from "vitest";
import type { DriftReport } from "@schemabridge/shared-types";
import { createControlPlaneApp } from "./app";
import { InstanceRegistry } from "./services/instanceRegistry";
import { InMemoryDriftStore } from "./services/driftStore";

const TENANT = "tenant-1";
const INSTANCE = "bridge-a";
const INSTANCE_TOKEN = "cp_instance_token";
const TENANT_KEY = "cp_tenant_key";
const BINDING_ID = "00000000-0000-4000-8000-0000000000f1";

function makeApp() {
  const registry = new InstanceRegistry(
    [{ token: INSTANCE_TOKEN, instanceId: INSTANCE, tenantId: TENANT }],
    [{ key: TENANT_KEY, tenantId: TENANT }]
  );
  return createControlPlaneApp({ registry, store: new InMemoryDriftStore() });
}

function report(events: DriftReport["events"], instanceId = INSTANCE): DriftReport {
  return { instanceId, bridgeVersion: "0.1.6", reportedAt: "2026-06-09T12:00:00.000Z", events };
}

function driftEvent(overrides: Partial<DriftReport["events"][number]> = {}): DriftReport["events"][number] {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    bindingId: BINDING_ID,
    stage: "response-source",
    kind: "added",
    path: "newField",
    expectedType: null,
    observedType: "string",
    count: 3,
    firstSeenAt: "2026-06-09T11:00:00.000Z",
    lastSeenAt: "2026-06-09T11:59:00.000Z",
    ...overrides
  };
}

describe("control plane", () => {
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    app = makeApp();
  });

  it("reports health", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.json()).toEqual({ status: "ok", service: "schema-bridge-control-plane" });
  });

  it("rejects ingest without a valid instance token", async () => {
    const response = await app.inject({ method: "POST", url: "/ingest/drift", payload: report([driftEvent()]) });
    expect(response.statusCode).toBe(401);
  });

  it("ingests a drift report and exposes it on the fleet view", async () => {
    const ingest = await app.inject({
      method: "POST",
      url: "/ingest/drift",
      headers: { authorization: `Bearer ${INSTANCE_TOKEN}` },
      payload: report([driftEvent()])
    });
    expect(ingest.statusCode).toBe(200);
    expect(ingest.json()).toEqual({ accepted: 1 });

    const fleet = await app.inject({ method: "GET", url: "/fleet/drift", headers: { authorization: `Bearer ${TENANT_KEY}` } });
    expect(fleet.statusCode).toBe(200);
    const records = fleet.json() as Array<Record<string, unknown>>;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ instanceId: INSTANCE, bindingId: BINDING_ID, kind: "added", path: "newField", count: 3 });
  });

  it("rejects a report whose instanceId does not match the token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/ingest/drift",
      headers: { authorization: `Bearer ${INSTANCE_TOKEN}` },
      payload: report([driftEvent()], "someone-else")
    });
    expect(response.statusCode).toBe(403);
  });

  it("replaces an instance's prior snapshot on each report", async () => {
    const headers = { authorization: `Bearer ${INSTANCE_TOKEN}` };
    await app.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "fieldA" }), driftEvent({ path: "fieldB" })]) });
    // Second report only carries fieldB — fieldA was acknowledged on the data plane.
    await app.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "fieldB" })]) });

    const fleet = await app.inject({ method: "GET", url: "/fleet/drift", headers: { authorization: `Bearer ${TENANT_KEY}` } });
    const records = fleet.json() as Array<{ path: string }>;
    expect(records.map((record) => record.path)).toEqual(["fieldB"]);
  });

  it("isolates fleet reads to the authenticated tenant", async () => {
    await app.inject({ method: "POST", url: "/ingest/drift", headers: { authorization: `Bearer ${INSTANCE_TOKEN}` }, payload: report([driftEvent()]) });
    const response = await app.inject({ method: "GET", url: "/fleet/drift", headers: { authorization: "Bearer wrong" } });
    expect(response.statusCode).toBe(401);
  });

  it("filters the fleet view by kind", async () => {
    await app.inject({
      method: "POST",
      url: "/ingest/drift",
      headers: { authorization: `Bearer ${INSTANCE_TOKEN}` },
      payload: report([driftEvent({ path: "a", kind: "added" }), driftEvent({ path: "b", kind: "missing", observedType: null, expectedType: "string" })])
    });
    const fleet = await app.inject({ method: "GET", url: "/fleet/drift?kind=missing", headers: { authorization: `Bearer ${TENANT_KEY}` } });
    const records = fleet.json() as Array<{ path: string; kind: string }>;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ path: "b", kind: "missing" });
  });
});
