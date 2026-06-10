import { beforeEach, describe, expect, it } from "vitest";
import type { DriftReport } from "@schemabridge/shared-types";
import { createControlPlaneApp } from "./app";
import { InstanceRegistry } from "./services/instanceRegistry";
import { InMemoryDriftStore } from "./services/driftStore";
import type { DriftAlert, Notifier } from "./services/notifier";

const TENANT = "tenant-1";
const INSTANCE = "bridge-a";
const INSTANCE_TOKEN = "cp_instance_token";
const TENANT_KEY = "cp_tenant_key";
const BINDING_ID = "00000000-0000-4000-8000-0000000000f1";

class RecordingNotifier implements Notifier {
  public readonly alerts: DriftAlert[] = [];
  public async notify(alert: DriftAlert): Promise<void> {
    this.alerts.push(alert);
  }
}

function makeApp(notifier?: Notifier) {
  const registry = new InstanceRegistry(
    [{ token: INSTANCE_TOKEN, instanceId: INSTANCE, tenantId: TENANT }],
    [{ key: TENANT_KEY, tenantId: TENANT }]
  );
  return createControlPlaneApp({ registry, store: new InMemoryDriftStore(), notifier });
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

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
    expect(ingest.json()).toEqual({ accepted: 1, alerts: 1 });

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

  describe("alerting", () => {
    const headers = { authorization: `Bearer ${INSTANCE_TOKEN}` };

    it("alerts on newly appeared drift", async () => {
      const notifier = new RecordingNotifier();
      const alertApp = makeApp(notifier);
      await alertApp.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "newField" })]) });
      await flush();

      expect(notifier.alerts).toHaveLength(1);
      expect(notifier.alerts[0]).toMatchObject({ tenantId: TENANT, instanceId: INSTANCE });
      expect(notifier.alerts[0].newFindings.map((finding) => finding.path)).toEqual(["newField"]);
    });

    it("does not re-alert for drift already reported", async () => {
      const notifier = new RecordingNotifier();
      const alertApp = makeApp(notifier);
      await alertApp.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "stable" })]) });
      await alertApp.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "stable" })]) });
      await flush();

      expect(notifier.alerts).toHaveLength(1);
    });

    it("alerts only on the genuinely new path when a later report adds one", async () => {
      const notifier = new RecordingNotifier();
      const alertApp = makeApp(notifier);
      await alertApp.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "a" })]) });
      await alertApp.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent({ path: "a" }), driftEvent({ path: "b" })]) });
      await flush();

      expect(notifier.alerts).toHaveLength(2);
      expect(notifier.alerts[1].newFindings.map((finding) => finding.path)).toEqual(["b"]);
    });

    it("works without a notifier configured", async () => {
      const response = await app.inject({ method: "POST", url: "/ingest/drift", headers, payload: report([driftEvent()]) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ alerts: 1 });
    });
  });
});
