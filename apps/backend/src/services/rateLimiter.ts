import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface RateLimitOptions {
  readonly max: number;
  readonly windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function registerInMemoryRateLimit(app: FastifyInstance, options: RateLimitOptions): void {
  if (options.max <= 0 || options.windowMs <= 0) return;

  const buckets = new Map<string, Bucket>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.min(options.windowMs, 60_000));
  cleanup.unref();

  app.addHook("onClose", () => {
    clearInterval(cleanup);
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const now = Date.now();
    const key = clientKey(request);
    const existing = buckets.get(key);
    const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + options.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(options.max - bucket.count, 0);
    reply.header("x-ratelimit-limit", String(options.max));
    reply.header("x-ratelimit-remaining", String(remaining));
    reply.header("x-ratelimit-reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      reply.header("retry-after", String(retryAfter));
      return rateLimited(reply);
    }
  });
}

function clientKey(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return firstForwarded?.split(",")[0]?.trim() || request.ip;
}

function rateLimited(reply: FastifyReply) {
  return reply.code(429).send({ error: "rate limit exceeded" });
}
