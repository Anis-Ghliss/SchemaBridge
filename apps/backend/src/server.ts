import { readFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "./db.js";
import { createApp } from "./app.js";
import { createProxyApp } from "./proxyApp.js";
import { SchemaBridgeRepository } from "./services/repository.js";
import {
  CreateSchemaRequestSchema,
  MappingRuleSchema,
  ProxyBindingMethodSchema
} from "@schemabridge/shared-types";

const SeedFileSchema = z.object({
  schemas: z.array(CreateSchemaRequestSchema).optional(),
  mappings: z
    .array(
      z.object({
        name: z.string().min(1),
        sourceSchemaName: z.string().min(1),
        targetSchemaName: z.string().min(1),
        rules: z.array(MappingRuleSchema)
      })
    )
    .optional(),
  bindings: z
    .array(
      z.object({
        name: z.string().min(1),
        method: ProxyBindingMethodSchema,
        pathPattern: z.string().min(1),
        upstreamBaseUrl: z.string().url(),
        mappingName: z.string().min(1),
        responseMappingName: z.string().min(1).nullable().optional(),
        forwardHeaders: z.array(z.string().min(1)).optional(),
        enabled: z.boolean().optional()
      })
    )
    .optional()
});

async function runSeed(path: string): Promise<void> {
  try {
    const content = await readFile(path, "utf8");
    const parsed = SeedFileSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.warn(`[seed] invalid file: ${parsed.error.message}`);
      return;
    }

    const repository = new SchemaBridgeRepository(prisma);
    const existing = await repository.listBindings();
    if (existing.length > 0) {
      console.log(`[seed] skipping; ${existing.length} bindings already present`);
      return;
    }

    const schemasByName = new Map<string, string>();
    for (const schema of parsed.data.schemas ?? []) {
      const created = await repository.createSchema(schema);
      schemasByName.set(schema.name, created.id);
      console.log(`[seed] schema ${schema.name}`);
    }

    const mappingsByName = new Map<string, string>();
    for (const mapping of parsed.data.mappings ?? []) {
      const sourceId = schemasByName.get(mapping.sourceSchemaName);
      const targetId = schemasByName.get(mapping.targetSchemaName);
      if (!sourceId || !targetId) {
        console.warn(`[seed] mapping ${mapping.name} references unknown schema; skipping`);
        continue;
      }
      const created = await repository.createMapping({ name: mapping.name, sourceSchemaId: sourceId, targetSchemaId: targetId, rules: mapping.rules });
      mappingsByName.set(mapping.name, created.id);
      console.log(`[seed] mapping ${mapping.name}`);
    }

    for (const binding of parsed.data.bindings ?? []) {
      const mappingId = mappingsByName.get(binding.mappingName);
      if (!mappingId) {
        console.warn(`[seed] binding ${binding.name} references unknown mapping; skipping`);
        continue;
      }
      const responseMappingId = binding.responseMappingName ? mappingsByName.get(binding.responseMappingName) ?? null : null;
      await repository.createBinding({
        name: binding.name,
        method: binding.method,
        pathPattern: binding.pathPattern,
        upstreamBaseUrl: binding.upstreamBaseUrl,
        mappingId,
        responseMappingId,
        forwardHeaders: binding.forwardHeaders,
        enabled: binding.enabled
      });
      console.log(`[seed] binding ${binding.name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.warn(`[seed] failed to load ${path}: ${message}`);
  }
}

const adminPort = Number(process.env.PORT ?? 4000);
const proxyPort = Number(process.env.PROXY_PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const corsOrigin = process.env.CORS_ORIGIN;
const seedFile = process.env.BINDINGS_SEED_FILE;

if (seedFile) {
  await runSeed(seedFile);
}

const proxyBundle = await createProxyApp({ prisma, corsOrigin });
const adminApp = createApp({ prisma, corsOrigin, onBindingsChanged: () => proxyBundle.proxyService.reload() });

await Promise.all([
  adminApp.listen({ port: adminPort, host }),
  proxyBundle.app.listen({ port: proxyPort, host })
]);
