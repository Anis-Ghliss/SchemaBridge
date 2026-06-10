import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DriftReport } from "@schemabridge/shared-types";
import { InMemoryDriftStore, type DriftStore } from "./driftStore";
import { FileDriftStore } from "./fileDriftStore";

const TENANT = "tenant-1";
const INSTANCE = "bridge-a";
const BINDING_ID = "00000000-0000-4000-8000-0000000000f1";

function event(overrides: Partial<DriftReport["events"][number]> = {}): DriftReport["events"][number] {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    bindingId: BINDING_ID,
    stage: "response-source",
    kind: "added",
    path: "newField",
    expectedType: null,
    observedType: "string",
    count: 1,
    firstSeenAt: "2026-06-10T11:00:00.000Z",
    lastSeenAt: "2026-06-10T11:59:00.000Z",
    ...overrides
  };
}

function report(events: DriftReport["events"], instanceId = INSTANCE): DriftReport {
  return { instanceId, bridgeVersion: "0.1.8", reportedAt: "2026-06-10T12:00:00.000Z", events };
}

const tempDirs: string[] = [];
function makeFileStore(): DriftStore {
  const dir = mkdtempSync(join(tmpdir(), "cp-drift-"));
  tempDirs.push(dir);
  return new FileDriftStore(join(dir, "drift.json"));
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

const backends: Array<[string, () => DriftStore]> = [
  ["InMemoryDriftStore", () => new InMemoryDriftStore()],
  ["FileDriftStore", makeFileStore]
];

describe.each(backends)("DriftStore contract: %s", (_name, makeStore) => {
  it("reports newly appeared findings and accepts the snapshot", async () => {
    const store = makeStore();
    const result = await store.recordReport(TENANT, report([event({ path: "a" })]));
    expect(result.accepted).toBe(1);
    expect(result.newFindings.map((f) => f.path)).toEqual(["a"]);
  });

  it("does not re-report findings already present", async () => {
    const store = makeStore();
    await store.recordReport(TENANT, report([event({ path: "a" })]));
    const second = await store.recordReport(TENANT, report([event({ path: "a" })]));
    expect(second.newFindings).toHaveLength(0);
  });

  it("replaces an instance's prior snapshot", async () => {
    const store = makeStore();
    await store.recordReport(TENANT, report([event({ path: "a" }), event({ path: "b" })]));
    await store.recordReport(TENANT, report([event({ path: "b" })]));
    const fleet = await store.listFleetDrift(TENANT);
    expect(fleet.map((f) => f.path)).toEqual(["b"]);
  });

  it("isolates one tenant's drift from another", async () => {
    const store = makeStore();
    await store.recordReport(TENANT, report([event()]));
    expect(await store.listFleetDrift("other-tenant")).toHaveLength(0);
  });

  it("filters the fleet view by kind", async () => {
    const store = makeStore();
    await store.recordReport(TENANT, report([event({ path: "a", kind: "added" }), event({ path: "b", kind: "missing", expectedType: "string", observedType: null })]));
    const missing = await store.listFleetDrift(TENANT, { kind: "missing" });
    expect(missing.map((f) => f.path)).toEqual(["b"]);
  });
});

describe("FileDriftStore durability", () => {
  it("persists drift across store instances on the same file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cp-drift-"));
    tempDirs.push(dir);
    const path = join(dir, "drift.json");

    const first = new FileDriftStore(path);
    await first.recordReport(TENANT, report([event({ path: "survives" })]));

    // A fresh store (simulating a restart) reads the persisted snapshot...
    const reborn = new FileDriftStore(path);
    const fleet = await reborn.listFleetDrift(TENANT);
    expect(fleet.map((f) => f.path)).toEqual(["survives"]);

    // ...and therefore does not re-alert on the same drift after the restart.
    const result = await reborn.recordReport(TENANT, report([event({ path: "survives" })]));
    expect(result.newFindings).toHaveLength(0);
  });
});
