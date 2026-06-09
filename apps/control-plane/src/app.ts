import cors from "@fastify/cors";
import { DriftKindSchema, DriftReportSchema } from "@schemabridge/shared-types";
import fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import type { InstanceRegistry } from "./services/instanceRegistry.js";
import type { DriftStore } from "./services/driftStore.js";

export interface ControlPlaneOptions {
  readonly registry: InstanceRegistry;
  readonly store: DriftStore;
  readonly corsOrigin?: string;
  readonly bodyLimitBytes?: number;
}

export function createControlPlaneApp(options: ControlPlaneOptions): FastifyInstance {
  const app = fastify({ logger: true, bodyLimit: options.bodyLimitBytes });
  const { registry, store } = options;

  app.register(cors, { origin: options.corsOrigin ?? true });

  app.get("/health", async () => ({ status: "ok", service: "schema-bridge-control-plane" }));

  // Data-plane → control-plane ingest. Authenticated with an instance token.
  app.post("/ingest/drift", async (request, reply) => {
    const identity = registry.resolveInstance(parseBearerToken(request.headers["authorization"]));
    if (!identity) return reply.code(401).send({ error: "invalid instance token" });

    const body = DriftReportSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ errors: body.error.errors.map(formatIssue) });

    // The token is bound to a specific instance; reject a report claiming another.
    if (body.data.instanceId !== identity.instanceId) {
      return reply.code(403).send({ error: "report instanceId does not match the authenticated instance" });
    }

    const accepted = await store.recordReport(identity.tenantId, body.data);
    return { accepted };
  });

  // Tenant fleet view. Authenticated with a tenant key.
  app.get("/fleet/drift", async (request, reply) => {
    const tenantId = registry.resolveTenant(parseBearerToken(request.headers["authorization"]));
    if (!tenantId) return reply.code(401).send({ error: "invalid tenant key" });

    const query = FleetQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ errors: query.error.errors.map(formatIssue) });

    return store.listFleetDrift(tenantId, query.data);
  });

  return app;
}

const FleetQuerySchema = z.object({
  instanceId: z.string().min(1).optional(),
  bindingId: z.string().uuid().optional(),
  kind: DriftKindSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).optional()
});

function formatIssue(issue: z.ZodIssue): string {
  return `${issue.path.join(".")}: ${issue.message}`;
}

function parseBearerToken(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== "string") return undefined;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}
