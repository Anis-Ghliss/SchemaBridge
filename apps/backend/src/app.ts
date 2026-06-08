import cors from "@fastify/cors";
import type { PrismaClient } from "@prisma/client";
import { transformPayload, validateMappingRules } from "@schemabridge/transformation-engine";
import fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CreateMappingRequestSchema,
  CreateProxyBindingRequestSchema,
  CreateSchemaRequestSchema,
  RestoreMappingVersionRequestSchema,
  TransformRequestSchema,
  UpdateProxyBindingRequestSchema
} from "@schemabridge/shared-types";
import { SchemaBridgeRepository } from "./services/repository.js";

export interface AppOptions {
  readonly prisma: PrismaClient;
  readonly corsOrigin?: string;
  readonly onBindingsChanged?: () => void | Promise<void>;
}

export function createApp(options: AppOptions): FastifyInstance {
  const app = fastify({ logger: true });
  const repository = new SchemaBridgeRepository(options.prisma);

  app.register(cors, { origin: options.corsOrigin ?? true });

  registerAdminRoutes(app, repository, options.onBindingsChanged);

  return app;
}

export function registerAdminRoutes(app: FastifyInstance, repository: SchemaBridgeRepository, onBindingsChanged?: () => void | Promise<void>): void {
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
    const binding = await repository.createBinding(body.data);
    await onBindingsChanged?.();
    return binding;
  });

  app.patch("/bindings/:id", async (request, reply) => {
    const params = parseBody(z.object({ id: z.string().uuid() }), request.params);
    const body = parseBody(UpdateProxyBindingRequestSchema, request.body);
    if (!params.success) return reply.code(400).send({ errors: params.error });
    if (!body.success) return reply.code(400).send({ errors: body.error });
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
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): { readonly success: true; readonly data: T } | { readonly success: false; readonly error: readonly string[] } {
  const result = schema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.errors.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}
