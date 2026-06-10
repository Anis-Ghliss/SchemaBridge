import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent } from "undici";
import { WebhookNotifier, type DriftAlert } from "./notifier";
import type { FleetDriftRecord } from "./driftStore";

function finding(overrides: Partial<FleetDriftRecord> = {}): FleetDriftRecord {
  return {
    tenantId: "tenant-1",
    instanceId: "bridge-a",
    bridgeVersion: "0.1.7",
    bindingId: "00000000-0000-4000-8000-0000000000f1",
    stage: "response-source",
    kind: "added",
    path: "newField",
    expectedType: null,
    observedType: "string",
    count: 2,
    firstSeenAt: "2026-06-10T10:00:00.000Z",
    lastSeenAt: "2026-06-10T11:00:00.000Z",
    reportedAt: "2026-06-10T11:00:01.000Z",
    ...overrides
  };
}

function alert(findings: FleetDriftRecord[]): DriftAlert {
  return { tenantId: "tenant-1", instanceId: "bridge-a", bridgeVersion: "0.1.7", newFindings: findings };
}

describe("webhook notifier", () => {
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
  });

  afterEach(async () => {
    await agent.close();
  });

  it("posts a Slack-compatible payload with a structured alert", async () => {
    let body: string | undefined;
    agent.get("http://hooks.local").intercept({ path: "/alert", method: "POST" }).reply((opts) => {
      body = typeof opts.body === "string" ? opts.body : String(opts.body);
      return { statusCode: 200, data: "ok" };
    });

    await new WebhookNotifier("http://hooks.local/alert", { dispatcher: agent }).notify(alert([finding()]));

    const payload = JSON.parse(body as string) as { text: string; alert: DriftAlert };
    expect(payload.text).toContain("1 new contract drift signal");
    expect(payload.text).toContain("[added] response-source newField");
    expect(payload.alert.newFindings).toHaveLength(1);
  });

  it("does not POST when there are no new findings", async () => {
    // disableNetConnect would throw if a request were attempted.
    await new WebhookNotifier("http://hooks.local/alert", { dispatcher: agent }).notify(alert([]));
  });

  it("throws when the webhook rejects the alert", async () => {
    agent.get("http://hooks.local").intercept({ path: "/alert", method: "POST" }).reply(500, "boom");
    await expect(new WebhookNotifier("http://hooks.local/alert", { dispatcher: agent }).notify(alert([finding()]))).rejects.toThrow(/responded 500/);
  });
});
