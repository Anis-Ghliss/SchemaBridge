import { createControlPlaneApp } from "./app.js";
import { InstanceRegistry, type InstanceRegistration, type TenantRegistration } from "./services/instanceRegistry.js";
import { InMemoryDriftStore, type DriftStore } from "./services/driftStore.js";
import { FileDriftStore } from "./services/fileDriftStore.js";
import { WebhookNotifier, type Notifier } from "./services/notifier.js";

const port = Number(process.env.PORT ?? 5000);
const host = process.env.HOST ?? "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN;
const bodyLimitBytes = parsePositiveInteger(process.env.BODY_LIMIT_BYTES, 5_242_880);

// First-slice seeding: instances/tenants come from env JSON. A production
// control plane resolves these from a database of hashed credentials instead.
const instances = parseJsonArray<InstanceRegistration>(process.env.CONTROL_PLANE_INSTANCES, "CONTROL_PLANE_INSTANCES");
const tenants = parseJsonArray<TenantRegistration>(process.env.CONTROL_PLANE_TENANTS, "CONTROL_PLANE_TENANTS");

const alertWebhookUrl = process.env.CONTROL_PLANE_ALERT_WEBHOOK_URL?.trim();
const notifier: Notifier | undefined = alertWebhookUrl
  ? new WebhookNotifier(alertWebhookUrl, { token: process.env.CONTROL_PLANE_ALERT_TOKEN?.trim() || undefined })
  : undefined;

const dataFile = process.env.CONTROL_PLANE_DATA_FILE?.trim();
const store: DriftStore = dataFile ? new FileDriftStore(dataFile) : new InMemoryDriftStore();

const app = createControlPlaneApp({
  registry: new InstanceRegistry(instances, tenants),
  store,
  notifier,
  corsOrigin,
  bodyLimitBytes
});

if (dataFile) {
  console.log(`[control-plane] persisting fleet drift to ${dataFile}`);
} else {
  console.warn("[control-plane] CONTROL_PLANE_DATA_FILE is unset; fleet drift is in-memory and lost on restart.");
}

if (!alertWebhookUrl) {
  console.warn("[control-plane] CONTROL_PLANE_ALERT_WEBHOOK_URL is unset; drift alerts are disabled.");
}

if (instances.length === 0) {
  console.warn("[control-plane] WARNING: no instances registered (CONTROL_PLANE_INSTANCES is empty); ingest will reject every report.");
}

await app.listen({ port, host });

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[control-plane] ${signal} received, closing…`);
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[control-plane] shutdown error: ${message}`);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

function parseJsonArray<T>(value: string | undefined, name: string): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
    return parsed as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    console.warn(`[control-plane] ignoring invalid ${name}: ${message}`);
    return [];
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
