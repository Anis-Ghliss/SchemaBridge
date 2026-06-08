import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import fastify, { type FastifyInstance } from "fastify";
import { SchemaBridgeRepository } from "./services/repository.js";
import { ProxyService } from "./services/proxyService.js";
import type { Dispatcher } from "undici";

export interface ProxyAppOptions {
  readonly prisma: PrismaClient;
  readonly corsOrigin?: string;
  readonly dispatcher?: Dispatcher;
}

export interface ProxyAppBundle {
  readonly app: FastifyInstance;
  readonly proxyService: ProxyService;
}

export async function createProxyApp(options: ProxyAppOptions): Promise<ProxyAppBundle> {
  const app = fastify({ logger: true });
  const repository = new SchemaBridgeRepository(options.prisma);
  const proxyService = new ProxyService(repository, { dispatcher: options.dispatcher });

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

      const matched = proxyService.matchBinding(request.method, path);
      if (!matched) {
        const durationMs = Date.now() - startedAt;
        recordSafely(repository, {
          bindingId: null,
          method: request.method,
          path,
          statusCode: 404,
          durationMs,
          errors: [`no binding for ${request.method} ${path}`]
        });
        return reply.code(404).send({ error: `No proxy binding for ${request.method} ${path}` });
      }

      const result = await proxyService.forward(matched.active, {
        method: request.method,
        path,
        query,
        headers: request.headers,
        body: request.body
      });

      const durationMs = Date.now() - startedAt;
      recordSafely(repository, {
        bindingId: matched.active.binding.id,
        method: request.method,
        path,
        statusCode: result.statusCode,
        durationMs,
        upstreamUrl: result.trace.upstreamUrl,
        transformedRequest: result.trace.transformedRequest,
        responseBody: result.body,
        errors: result.trace.errors
      });

      reply.code(result.statusCode);
      for (const [key, value] of Object.entries(result.headers)) {
        if (value === undefined) continue;
        reply.header(key, value);
      }
      return result.body;
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
