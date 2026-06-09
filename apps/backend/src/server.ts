import { prisma } from "./db.js";
import { createApp } from "./app.js";
import { createProxyApp } from "./proxyApp.js";
import { SchemaBridgeRepository } from "./services/repository.js";
import { defaultEgressPolicy, type EgressPolicy } from "./services/egressGuard.js";
import { evaluateStartupSecurity } from "./services/startupGuard.js";
import { ControlPlaneReporter } from "./services/controlPlaneReporter.js";
import { hostname } from "node:os";

const adminPort = Number(process.env.PORT ?? 4000);
const proxyPort = Number(process.env.PROXY_PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN;
const frontendDist = process.env.FRONTEND_DIST;
const requireAuth = (process.env.PROXY_REQUIRE_AUTH ?? "false").toLowerCase() === "true";
const adminApiKey = process.env.ADMIN_API_KEY?.trim() || undefined;
const requestLogRetentionDays = parsePositiveNumber(process.env.PROXY_REQUEST_LOG_RETENTION_DAYS);
const adminBodyLimitBytes = parsePositiveInteger(process.env.ADMIN_BODY_LIMIT_BYTES, 1_048_576, "ADMIN_BODY_LIMIT_BYTES");
const proxyBodyLimitBytes = parsePositiveInteger(process.env.PROXY_BODY_LIMIT_BYTES, 1_048_576, "PROXY_BODY_LIMIT_BYTES");
const upstreamTimeoutMs = parsePositiveInteger(process.env.PROXY_UPSTREAM_TIMEOUT_MS, 30_000, "PROXY_UPSTREAM_TIMEOUT_MS");
const trustProxy = (process.env.TRUST_PROXY ?? "false").toLowerCase() === "true";
const captureBodies = (process.env.PROXY_LOG_BODIES ?? "true").toLowerCase() !== "false";
const driftSampleRate = parseRate(process.env.DRIFT_SAMPLE_RATE, 1);
const egressPolicy = buildEgressPolicy();
const adminRateLimit = {
  max: parseNonNegativeInteger(process.env.ADMIN_RATE_LIMIT_MAX, 600, "ADMIN_RATE_LIMIT_MAX"),
  windowMs: parsePositiveInteger(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60_000, "ADMIN_RATE_LIMIT_WINDOW_MS"),
  trustProxy
};
const proxyRateLimit = {
  max: parseNonNegativeInteger(process.env.PROXY_RATE_LIMIT_MAX, 1_200, "PROXY_RATE_LIMIT_MAX"),
  windowMs: parsePositiveInteger(process.env.PROXY_RATE_LIMIT_WINDOW_MS, 60_000, "PROXY_RATE_LIMIT_WINDOW_MS"),
  trustProxy
};

const startupSecurity = evaluateStartupSecurity({
  nodeEnv: process.env.NODE_ENV,
  requireAuth,
  adminApiKey,
  allowInsecure: (process.env.BRIDGE_ALLOW_INSECURE ?? "false").toLowerCase() === "true"
});
for (const warning of startupSecurity.warnings) {
  console.warn(`[bridge] WARNING: ${warning}`);
}
if (startupSecurity.fatal.length > 0) {
  for (const issue of startupSecurity.fatal) {
    console.error(`[bridge] FATAL: ${issue}`);
  }
  console.error("[bridge] Refusing to start an unauthenticated bridge in production. Set ADMIN_API_KEY and PROXY_REQUIRE_AUTH=true, or set BRIDGE_ALLOW_INSECURE=true to override.");
  process.exit(1);
}

const proxyBundle = await createProxyApp({
  prisma,
  corsOrigin,
  requireAuth,
  bodyLimitBytes: proxyBodyLimitBytes,
  rateLimit: proxyRateLimit.max > 0 ? proxyRateLimit : undefined,
  upstreamTimeoutMs,
  egressPolicy,
  captureBodies,
  driftSampleRate
});
const adminApp = createApp({
  prisma,
  corsOrigin,
  frontendDist,
  adminApiKey,
  bodyLimitBytes: adminBodyLimitBytes,
  rateLimit: adminRateLimit.max > 0 ? adminRateLimit : undefined,
  egressPolicy,
  onBindingsChanged: () => proxyBundle.proxyService.reload()
});

const retentionInterval = requestLogRetentionDays ? startProxyRequestLogRetention(requestLogRetentionDays) : undefined;
const reporter = startControlPlaneReporter();

await Promise.all([
  adminApp.listen({ port: adminPort, host }),
  proxyBundle.app.listen({ port: proxyPort, host })
]);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[bridge] ${signal} received, closing…`);
  try {
    if (retentionInterval) clearInterval(retentionInterval);
    reporter?.stop();
    await Promise.all([adminApp.close(), proxyBundle.app.close()]);
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[bridge] shutdown error: ${message}`);
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

function startControlPlaneReporter(): ControlPlaneReporter | undefined {
  const url = process.env.CONTROL_PLANE_URL?.trim();
  if (!url) return undefined; // OSS single-node mode: no phone-home unless configured.
  const reporter = new ControlPlaneReporter(new SchemaBridgeRepository(prisma), {
    url,
    token: process.env.CONTROL_PLANE_TOKEN?.trim() || undefined,
    instanceId: process.env.BRIDGE_INSTANCE_ID?.trim() || hostname(),
    bridgeVersion: process.env.BRIDGE_VERSION?.trim() || "unknown",
    intervalMs: parsePositiveInteger(process.env.CONTROL_PLANE_REPORT_INTERVAL_MS, 60_000, "CONTROL_PLANE_REPORT_INTERVAL_MS")
  });
  reporter.start();
  console.log(`[control-plane] reporting drift to ${url} as instance ${process.env.BRIDGE_INSTANCE_ID?.trim() || hostname()}`);
  return reporter;
}

function parseRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    console.warn(`[bridge] ignoring invalid DRIFT_SAMPLE_RATE=${JSON.stringify(value)}; expected a number between 0 and 1`);
    return fallback;
  }
  return parsed;
}

function buildEgressPolicy(): EgressPolicy {
  const base = defaultEgressPolicy();
  // Link-local / cloud-metadata and non-HTTP schemes are always blocked. Set
  // PROXY_ALLOW_PRIVATE_UPSTREAMS=false to additionally forbid loopback/private
  // ranges, and/or PROXY_UPSTREAM_ALLOWLIST to restrict upstreams to named hosts.
  const allowPrivate = (process.env.PROXY_ALLOW_PRIVATE_UPSTREAMS ?? "true").toLowerCase() !== "false";
  const allowlistRaw = process.env.PROXY_UPSTREAM_ALLOWLIST?.trim();
  const allowedHosts = allowlistRaw
    ? new Set(allowlistRaw.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean))
    : null;
  return { ...base, allowPrivate, allowedHosts };
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[bridge] ignoring invalid PROXY_REQUEST_LOG_RETENTION_DAYS=${JSON.stringify(value)}; expected a positive number`);
    return undefined;
  }
  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`[bridge] ignoring invalid ${name}=${JSON.stringify(value)}; expected a positive integer`);
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(`[bridge] ignoring invalid ${name}=${JSON.stringify(value)}; expected a non-negative integer`);
    return fallback;
  }
  return parsed;
}

function startProxyRequestLogRetention(retentionDays: number): NodeJS.Timeout {
  const repository = new SchemaBridgeRepository(prisma);
  const run = async () => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    try {
      const deleted = await repository.deleteProxyRequestsOlderThan(cutoff);
      if (deleted > 0) console.log(`[retention] deleted ${deleted} proxy request logs older than ${retentionDays} days`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[retention] failed to delete old proxy request logs: ${message}`);
    }
  };
  void run();
  const interval = setInterval(() => void run(), 24 * 60 * 60 * 1000);
  interval.unref();
  return interval;
}
