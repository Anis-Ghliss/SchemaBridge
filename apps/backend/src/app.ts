import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { PrismaClient } from "@prisma/client";
import { transformPayload, validateMappingRules } from "@schemabridge/transformation-engine";
import { existsSync } from "node:fs";
import fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { parseBearerToken, secretsEqual } from "./services/authService.js";
import { registerInMemoryRateLimit, type RateLimitOptions } from "./services/rateLimiter.js";
import { ProxyService } from "./services/proxyService.js";
import { checkEgress, defaultEgressPolicy, type EgressPolicy } from "./services/egressGuard.js";
import {
  CreateMappingRequestSchema,
  CreateProxyAppRequestSchema,
  CreateProxyBindingRequestSchema,
  CreateSchemaRequestSchema,
  RestoreMappingVersionRequestSchema,
  TransformRequestSchema,
  UpdateMappingVersionRequestSchema,
  UpdateProxyAppRequestSchema,
  UpdateProxyBindingRequestSchema,
  UpdateSchemaRequestSchema
} from "@schemabridge/shared-types";
import { SchemaBridgeRepository } from "./services/repository.js";

export interface AppOptions {
  readonly prisma: PrismaClient;
  readonly corsOrigin?: string;
  readonly frontendDist?: string;
  readonly adminApiKey?: string;
  readonly bodyLimitBytes?: number;
  readonly rateLimit?: RateLimitOptions;
  readonly egressPolicy?: EgressPolicy;
  readonly onBindingsChanged?: () => void | Promise<void>;
}

export function createApp(options: AppOptions): FastifyInstance {
  const app = fastify({ logger: true, bodyLimit: options.bodyLimitBytes });
  const repository = new SchemaBridgeRepository(options.prisma);
  const egressPolicy = options.egressPolicy ?? defaultEgressPolicy();

  app.register(cors, { origin: options.corsOrigin ?? true });
  if (options.rateLimit) registerInMemoryRateLimit(app, options.rateLimit);

  if (options.adminApiKey) {
    const expected = options.adminApiKey;
    app.addHook("onRequest", async (request, reply) => {
      if (isPublicRoute(request.method, request.url)) return;
      const token = parseBearerToken(request.headers["authorization"]);
      if (!secretsEqual(token, expected)) {
        reply.code(401).send({ error: "missing or invalid admin token" });
      }
    });
  }

  registerAdminRoutes(app, repository, egressPolicy, options.onBindingsChanged);

  if (options.frontendDist && existsSync(options.frontendDist)) {
    app.register(fastifyStatic, { root: options.frontendDist, prefix: "/", wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.includes(".")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "not found" });
    });
  }

  return app;
}

export function registerAdminRoutes(app: FastifyInstance, repository: SchemaBridgeRepository, egressPolicy: EgressPolicy, onBindingsChanged?: () => void | Promise<void>): void {
  app.get("/health", async () => ({ status: "ok", service: "schema-bridge-api" }));

  app.post("/schemas", async (request, reply) => {
    const body = parseBody(CreateSchemaRequestSchema, request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error });
    return repository.createSchema(body.data);
  });

  app.get("/schemas", async () => repository.listSchemas());

  app.get("/schemas/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const schema = await repository.getSchema(params.data.id);
    return schema ?? reply.code(404).send({ error: "Schema not found" });
  });

  app.patch("/schemas/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(UpdateSchemaRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const schema = await repository.updateSchema(params.data.id, body.data);
    return schema ?? reply.code(404).send({ error: "Schema not found" });
  });

  app.delete("/schemas/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const query = parseBody(DeleteQuerySchema, request.query);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!query.success) return reply.code(400).send({ errors: query.error });
    const result = await repository.deleteSchema(params.data.id, { cascade: query.data.cascade === "true" });
    if (!result.ok) {
      if (result.conflict === "not-found") return reply.code(404).send({ error: "Schema not found" });
      return reply.code(409).send({ error: result.conflict });
    }
    await onBindingsChanged?.();
    return reply.code(204).send();
  });

  app.post("/mappings", async (request, reply) => {
    const body = parseBody(CreateMappingRequestSchema, request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const validationErrors = validateMappingRules(body.data.rules);
    if (validationErrors.length > 0) return reply.code(400).send({ errors: validationErrors });
    return repository.createMapping(body.data);
  });

  app.get("/mappings", async () => repository.listMappings());

  app.get("/mappings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const mapping = await repository.getMapping(params.data.id);
    return mapping ?? reply.code(404).send({ error: "Mapping not found" });
  });

  app.delete("/mappings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const query = parseBody(DeleteQuerySchema, request.query);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!query.success) return reply.code(400).send({ errors: query.error });
    const result = await repository.deleteMapping(params.data.id, { cascade: query.data.cascade === "true" });
    if (!result.ok) {
      if (result.conflict === "not-found") return reply.code(404).send({ error: "Mapping not found" });
      return reply.code(409).send({ error: result.conflict });
    }
    await onBindingsChanged?.();
    return reply.code(204).send();
  });

  app.post("/mappings/:id/versions", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(z.object({ rules: CreateMappingRequestSchema.shape.rules }), request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const validationErrors = validateMappingRules(body.data.rules);
    if (validationErrors.length > 0) return reply.code(400).send({ errors: validationErrors });
    const mapping = await repository.createMappingVersion(params.data.id, body.data.rules);
    if (!mapping) return reply.code(404).send({ error: "Mapping not found" });
    await onBindingsChanged?.();
    return mapping;
  });

  app.patch("/mappings/:id/versions/current", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(UpdateMappingVersionRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const validationErrors = validateMappingRules(body.data.rules);
    if (validationErrors.length > 0) return reply.code(400).send({ errors: validationErrors });
    const mapping = await repository.updateCurrentMappingVersion(params.data.id, body.data.rules);
    if (!mapping) return reply.code(404).send({ error: "Mapping version not found" });
    await onBindingsChanged?.();
    return mapping;
  });

  app.post("/mappings/:id/restore", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(RestoreMappingVersionRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const mapping = await repository.restoreMappingVersion(params.data.id, body.data.version);
    if (!mapping) return reply.code(404).send({ error: "Mapping version not found" });
    await onBindingsChanged?.();
    return mapping;
  });

  app.post("/transform", async (request, reply) => {
    const body = parseBody(TransformRequestSchema, request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error });
    return transformPayload(body.data.input, body.data.rules, { includeMissingErrors: true });
  });

  app.get("/bindings", async () => repository.listBindings());

  app.get("/bindings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const binding = await repository.getBinding(params.data.id);
    return binding ?? reply.code(404).send({ error: "Binding not found" });
  });

  app.post("/bindings", async (request, reply) => {
    const body = parseBody(CreateProxyBindingRequestSchema, request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const egress = await checkEgress(body.data.upstreamBaseUrl, egressPolicy);
    if (!egress.ok) return reply.code(400).send({ errors: [`upstreamBaseUrl: ${egress.reason}`] });
    const binding = await repository.createBinding(body.data);
    await onBindingsChanged?.();
    return binding;
  });

  app.patch("/bindings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(UpdateProxyBindingRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    if (body.data.upstreamBaseUrl !== undefined) {
      const egress = await checkEgress(body.data.upstreamBaseUrl, egressPolicy);
      if (!egress.ok) return reply.code(400).send({ errors: [`upstreamBaseUrl: ${egress.reason}`] });
    }
    const binding = await repository.updateBinding(params.data.id, body.data);
    if (!binding) return reply.code(404).send({ error: "Binding not found" });
    await onBindingsChanged?.();
    return binding;
  });

  app.delete("/bindings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const deleted = await repository.deleteBinding(params.data.id);
    if (!deleted) return reply.code(404).send({ error: "Binding not found" });
    await onBindingsChanged?.();
    return reply.code(204).send();
  });

  app.post("/bindings/:id/probe", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(ProbeBindingRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });

    const activeBindings = await repository.listActiveBindings();
    const active = activeBindings.find((entry) => entry.binding.id === params.data.id);
    if (!active) return reply.code(404).send({ error: "Binding not found or disabled" });

    const appId = body.data.appId ?? null;
    if (appId) {
      const proxyApp = await repository.getProxyApp(appId);
      if (!proxyApp) return reply.code(404).send({ error: "App not found" });
      if (!proxyApp.enabled) return reply.code(403).send({ error: "app is disabled" });
      if (proxyApp.scope === "selected" && !proxyApp.bindingIds.includes(active.binding.id)) {
        return reply.code(403).send({ error: "api key not authorized for this binding" });
      }
    }

    const method = active.binding.method === "*" ? "POST" : active.binding.method;
    const path = concretizePath(active.binding.pathPattern);
    const proxyService = new ProxyService(repository, { egressPolicy });
    const startedAt = Date.now();
    const result = await proxyService.forward(active, {
      method,
      path,
      query: "",
      headers: { "content-type": "application/json" },
      body: body.data.input
    });
    await repository.recordProxyRequest({
      bindingId: active.binding.id,
      appId,
      method,
      path,
      statusCode: result.statusCode,
      durationMs: Date.now() - startedAt,
      upstreamUrl: result.trace.upstreamUrl,
      incomingRequest: body.data.input,
      transformedRequest: result.trace.transformedRequest,
      responseBody: result.body,
      errors: result.trace.errors
    });
    return { status: result.statusCode, headers: result.headers, body: result.body };
  });

  app.get("/apps", async () => repository.listProxyApps());

  app.get("/apps/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const app = await repository.getProxyApp(params.data.id);
    return app ?? reply.code(404).send({ error: "App not found" });
  });

  app.post("/apps", async (request, reply) => {
    const body = parseBody(CreateProxyAppRequestSchema, request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error });
    return repository.createProxyApp(body.data);
  });

  app.patch("/apps/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(UpdateProxyAppRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
    const app = await repository.updateProxyApp(params.data.id, body.data);
    return app ?? reply.code(404).send({ error: "App not found" });
  });

  app.post("/apps/:id/rotate", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const app = await repository.rotateProxyAppKey(params.data.id);
    return app ?? reply.code(404).send({ error: "App not found" });
  });

  app.delete("/apps/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    const deleted = await repository.deleteProxyApp(params.data.id);
    if (!deleted) return reply.code(404).send({ error: "App not found" });
    return reply.code(204).send();
  });

  app.get("/proxy/requests", async (request, reply) => {
    const query = parseBody(
      z.object({
        limit: z.coerce.number().int().positive().max(200).optional(),
        since: z.string().uuid().optional()
      }),
      request.query
    );
    if (!query.success) return reply.code(400).send({ errors: query.error });
    return repository.listProxyRequests({ limit: query.data.limit, since: query.data.since });
  });
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): { readonly success: true; readonly data: T } | { readonly success: false; readonly error: readonly string[] } {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.errors.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

const DeleteQuerySchema = z.object({
  cascade: z.enum(["true", "false"]).optional()
});

const ProbeBindingRequestSchema = z.object({
  appId: z.string().uuid().nullable().optional(),
  input: z.unknown()
});

function concretizePath(pattern: string): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, "sample");
}

// Every privileged API surface. Requests to these always require an admin token;
// any future API route should be added here so it cannot be silently exposed.
const PROTECTED_API_PREFIXES = ["/schemas", "/mappings", "/bindings", "/apps", "/proxy", "/transform"];

function isPublicRoute(method: string, url: string): boolean {
  if (method === "OPTIONS") return true;
  const path = url.split("?")[0];
  if (path === "/health") return true;
  if (matchesProtectedPrefix(url)) return false;
  // Remaining GETs are the SPA shell / static bundle assets served from disk;
  // they carry no privileged data. Any non-GET to a non-API path stays gated.
  return method === "GET";
}

function matchesProtectedPrefix(url: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
}
