import { prisma } from "./db.js";
import { createApp } from "./app.js";
import { createProxyApp } from "./proxyApp.js";
import { SchemaBridgeRepository } from "./services/repository.js";

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
const adminRateLimit = {
  max: parseNonNegativeInteger(process.env.ADMIN_RATE_LIMIT_MAX, 600, "ADMIN_RATE_LIMIT_MAX"),
  windowMs: parsePositiveInteger(process.env.ADMIN_RATE_LIMIT_WINDOW_MS, 60_000, "ADMIN_RATE_LIMIT_WINDOW_MS")
};
const proxyRateLimit = {
  max: parseNonNegativeInteger(process.env.PROXY_RATE_LIMIT_MAX, 1_200, "PROXY_RATE_LIMIT_MAX"),
  windowMs: parsePositiveInteger(process.env.PROXY_RATE_LIMIT_WINDOW_MS, 60_000, "PROXY_RATE_LIMIT_WINDOW_MS")
};

if (process.env.NODE_ENV === "production") {
  if (!requireAuth) {
    console.warn("[bridge] WARNING: PROXY_REQUIRE_AUTH is not set to true. The proxy port is open to anyone who can reach it. Set PROXY_REQUIRE_AUTH=true and register apps in the Apps tab before exposing this bridge.");
  }
  if (!adminApiKey) {
    console.warn("[bridge] WARNING: ADMIN_API_KEY is unset. The admin API and GUI are open to anyone who can reach them. Set ADMIN_API_KEY before deploying.");
  }
}

const proxyBundle = await createProxyApp({
  prisma,
  corsOrigin,
  requireAuth,
  bodyLimitBytes: proxyBodyLimitBytes,
  rateLimit: proxyRateLimit.max > 0 ? proxyRateLimit : undefined,
  upstreamTimeoutMs
});
const adminApp = createApp({
  prisma,
  corsOrigin,
  frontendDist,
  adminApiKey,
  bodyLimitBytes: adminBodyLimitBytes,
  rateLimit: adminRateLimit.max > 0 ? adminRateLimit : undefined,
  onBindingsChanged: () => proxyBundle.proxyService.reload()
});

const retentionInterval = requestLogRetentionDays ? startProxyRequestLogRetention(requestLogRetentionDays) : undefined;

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
