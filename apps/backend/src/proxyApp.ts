import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import fastify, { type FastifyInstance } from "fastify";
import { SchemaBridgeRepository } from "./services/repository.js";
import { ProxyService } from "./services/proxyService.js";
import { parseBearerToken } from "./services/authService.js";
import type { Dispatcher } from "undici";

export interface ProxyAppOptions {
  readonly prisma: PrismaClient;
  readonly corsOrigin?: string;
  readonly dispatcher?: Dispatcher;
  readonly requireAuth?: boolean;
}

export interface ProxyAppBundle {
  readonly app: FastifyInstance;
  readonly proxyService: ProxyService;
}

export async function createProxyApp(options: ProxyAppOptions): Promise<ProxyAppBundle> {
  const app = fastify({ logger: true });
  const repository = new SchemaBridgeRepository(options.prisma);
  const proxyService = new ProxyService(repository, { dispatcher: options.dispatcher });
  const requireAuth = options.requireAuth ?? false;

  await proxyService.reload();

  app.register(cors, { origin: options.corsOrigin ?? true });

  app.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
    url: "/*",
    handler: async (request, reply) => {
      const startedAt = Date.now();
      const fullUrl = request.url;
      const queryIndex = fullUrl.indexOf("?");
      const path = queryIndex >= 0 ? fullUrl.slice(0, queryIndex) : fullUrl;
      const query = queryIndex >= 0 ? fullUrl.slice(queryIndex) : "";

      let authorizedAppId: string | null = null;
      if (requireAuth) {
        const token = parseBearerToken(request.headers["authorization"]);
        if (!token) {
          recordSafely(repository, { bindingId: null, appId: null, method: request.method, path, statusCode: 401, durationMs: Date.now() - startedAt, errors: ["missing Bearer token"] });
          return reply.code(401).send({ error: "missing Authorization Bearer token" });
        }
        const app = await repository.findProxyAppByPlaintextKey(token);
        if (!app) {
          recordSafely(repository, { bindingId: null, appId: null, method: request.method, path, statusCode: 401, durationMs: Date.now() - startedAt, errors: ["unknown api key"] });
          return reply.code(401).send({ error: "invalid api key" });
        }
        if (!app.enabled) {
          recordSafely(repository, { bindingId: null, appId: app.id, method: request.method, path, statusCode: 403, durationMs: Date.now() - startedAt, errors: ["app disabled"] });
          return reply.code(403).send({ error: "app is disabled" });
        }
        authorizedAppId = app.id;
        // touch lastUsedAt fire-and-forget
        void repository.touchProxyAppLastUsed(app.id).catch(() => undefined);

        const matched = proxyService.matchBinding(request.method, path);
        if (!matched) {
          recordSafely(repository, { bindingId: null, appId: app.id, method: request.method, path, statusCode: 404, durationMs: Date.now() - startedAt, errors: [`no binding for ${request.method} ${path}`] });
          return reply.code(404).send({ error: `No proxy binding for ${request.method} ${path}` });
        }
        if (app.scope === "selected" && !app.bindingIds.includes(matched.active.binding.id)) {
          recordSafely(repository, { bindingId: matched.active.binding.id, appId: app.id, method: request.method, path, statusCode: 403, durationMs: Date.now() - startedAt, errors: ["app key not authorized for this binding"] });
          return reply.code(403).send({ error: "api key not authorized for this binding" });
        }

        return forward(matched, request, path, query, reply, startedAt, app.id);
      }

      const matched = proxyService.matchBinding(request.method, path);
      if (!matched) {
        recordSafely(repository, { bindingId: null, appId: authorizedAppId, method: request.method, path, statusCode: 404, durationMs: Date.now() - startedAt, errors: [`no binding for ${request.method} ${path}`] });
        return reply.code(404).send({ error: `No proxy binding for ${request.method} ${path}` });
      }
      return forward(matched, request, path, query, reply, startedAt, authorizedAppId);

      async function forward(
        matched: NonNullable<ReturnType<typeof proxyService.matchBinding>>,
        req: typeof request,
        reqPath: string,
        reqQuery: string,
        rep: typeof reply,
        startMs: number,
        appId: string | null
      ) {
        const result = await proxyService.forward(matched.active, {
          method: req.method,
          path: reqPath,
          query: reqQuery,
          headers: req.headers,
          body: req.body
        });
        const durationMs = Date.now() - startMs;
        recordSafely(repository, {
          bindingId: matched.active.binding.id,
          appId,
          method: req.method,
          path: reqPath,
          statusCode: result.statusCode,
          durationMs,
          upstreamUrl: result.trace.upstreamUrl,
          transformedRequest: result.trace.transformedRequest,
          responseBody: result.body,
          errors: result.trace.errors
        });
        rep.code(result.statusCode);
        for (const [key, value] of Object.entries(result.headers)) {
          if (value === undefined) continue;
          rep.header(key, value);
        }
        return result.body;
      }
    }
  });

  return { app, proxyService };
}

function recordSafely(repository: SchemaBridgeRepository, input: Parameters<SchemaBridgeRepository["recordProxyRequest"]>[0]): void {
  void repository.recordProxyRequest(input).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[proxy] failed to record request: ${message}`);
  });
}
