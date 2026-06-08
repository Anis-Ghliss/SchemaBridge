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
      const fullUrl = request.url;
      const queryIndex = fullUrl.indexOf("?");
      const path = queryIndex >= 0 ? fullUrl.slice(0, queryIndex) : fullUrl;
      const query = queryIndex >= 0 ? fullUrl.slice(queryIndex) : "";

      const matched = proxyService.matchBinding(request.method, path);
      if (!matched) {
        return reply.code(404).send({ error: `No proxy binding for ${request.method} ${path}` });
      }

      const result = await proxyService.forward(matched.active, {
        method: request.method,
        path,
        query,
        headers: request.headers,
        body: request.body
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
