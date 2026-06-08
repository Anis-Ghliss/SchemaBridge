import { Prisma, type PrismaClient } from "@prisma/client";
import { parseSchema } from "@schemabridge/schema-parser";
import type {
  CreateMappingRequest,
  CreateProxyAppRequest,
  CreateProxyBindingRequest,
  CreateSchemaRequest,
  MappingDocument,
  MappingRule,
  ProxyApp,
  ProxyAppScope,
  ProxyAppWithKey,
  ProxyBinding,
  ProxyBindingMethod,
  ProxyRequestLog,
  SchemaDocument,
  UpdateProxyAppRequest,
  UpdateProxyBindingRequest
} from "@schemabridge/shared-types";
import { generateApiKey, hashApiKey } from "./authService.js";

type MappingRecord = Prisma.MappingGetPayload<{ include: { versions: true } }>;
type ProxyBindingRecord = Prisma.ProxyBindingGetPayload<Record<string, never>>;
type ProxyRequestLogRecord = Prisma.ProxyRequestLogGetPayload<Record<string, never>>;
type ProxyAppRecord = Prisma.ProxyAppGetPayload<Record<string, never>>;

const MAX_LOGGED_BODY_BYTES = 16_384;

export interface RecordProxyRequestInput {
  readonly bindingId: string | null;
  readonly appId?: string | null;
  readonly method: string;
  readonly path: string;
  readonly statusCode: number;
  readonly durationMs: number;
  readonly upstreamUrl?: string | null;
  readonly transformedRequest?: unknown;
  readonly responseBody?: unknown;
  readonly errors: readonly string[];
}

const DEFAULT_FORWARD_HEADERS: readonly string[] = ["content-type", "accept", "authorization"];

export interface ActiveBinding {
  readonly binding: ProxyBinding;
  readonly requestRules: readonly MappingRule[];
  readonly responseRules: readonly MappingRule[];
}

export class SchemaBridgeRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createSchema(input: CreateSchemaRequest): Promise<SchemaDocument> {
    const parsed = parseSchema(input.content);
    const record = await this.prisma.schemaDocument.create({
      data: {
        name: input.name,
        content: toPrismaJson(input.content),
        fields: parsed.fields as unknown as Prisma.InputJsonValue
      }
    });
    return {
      id: record.id,
      name: record.name,
      content: record.content as SchemaDocument["content"],
      fields: record.fields as unknown as SchemaDocument["fields"],
      createdAt: record.createdAt.toISOString()
    };
  }

  public async listSchemas(): Promise<readonly SchemaDocument[]> {
    const records = await this.prisma.schemaDocument.findMany({ orderBy: { createdAt: "desc" } });
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      content: record.content as SchemaDocument["content"],
      fields: record.fields as unknown as SchemaDocument["fields"],
      createdAt: record.createdAt.toISOString()
    }));
  }

  public async getSchema(id: string): Promise<SchemaDocument | null> {
    const record = await this.prisma.schemaDocument.findUnique({ where: { id } });
    if (!record) return null;
    return {
      id: record.id,
      name: record.name,
      content: record.content as SchemaDocument["content"],
      fields: record.fields as unknown as SchemaDocument["fields"],
      createdAt: record.createdAt.toISOString()
    };
  }

  public async createMapping(input: CreateMappingRequest): Promise<MappingDocument> {
    const mapping = await this.prisma.mapping.create({
      data: {
        name: input.name,
        sourceSchemaId: input.sourceSchemaId,
        targetSchemaId: input.targetSchemaId,
        versions: {
          create: {
            version: 1,
            rules: input.rules as unknown as Prisma.InputJsonValue
          }
        }
      },
      include: { versions: { orderBy: { version: "asc" } } }
    });

    return toMappingDocument(mapping);
  }

  public async listMappings(): Promise<readonly MappingDocument[]> {
    const records = await this.prisma.mapping.findMany({
      orderBy: { updatedAt: "desc" },
      include: { versions: { orderBy: { version: "asc" } } }
    });
    return records.map(toMappingDocument);
  }

  public async getMapping(id: string): Promise<MappingDocument | null> {
    const record = await this.prisma.mapping.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "asc" } } }
    });
    return record ? toMappingDocument(record) : null;
  }

  public async createMappingVersion(id: string, rules: readonly MappingRule[]): Promise<MappingDocument | null> {
    const mapping = await this.prisma.mapping.findUnique({ where: { id }, include: { versions: true } });
    if (!mapping) return null;

    const nextVersion = Math.max(0, ...mapping.versions.map((version) => version.version)) + 1;
    const updated = await this.prisma.mapping.update({
      where: { id },
      data: {
        currentVersion: nextVersion,
        versions: { create: { version: nextVersion, rules: rules as unknown as Prisma.InputJsonValue } }
      },
      include: { versions: { orderBy: { version: "asc" } } }
    });
    return toMappingDocument(updated);
  }

  public async restoreMappingVersion(id: string, version: number): Promise<MappingDocument | null> {
    const exists = await this.prisma.mappingVersion.findUnique({ where: { mappingId_version: { mappingId: id, version } } });
    if (!exists) return null;
    const updated = await this.prisma.mapping.update({
      where: { id },
      data: { currentVersion: version },
      include: { versions: { orderBy: { version: "asc" } } }
    });
    return toMappingDocument(updated);
  }

  public async listBindings(): Promise<readonly ProxyBinding[]> {
    const records = await this.prisma.proxyBinding.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(toProxyBinding);
  }

  public async getBinding(id: string): Promise<ProxyBinding | null> {
    const record = await this.prisma.proxyBinding.findUnique({ where: { id } });
    return record ? toProxyBinding(record) : null;
  }

  public async createBinding(input: CreateProxyBindingRequest): Promise<ProxyBinding> {
    const record = await this.prisma.proxyBinding.create({
      data: {
        name: input.name,
        method: input.method,
        pathPattern: input.pathPattern,
        upstreamBaseUrl: input.upstreamBaseUrl,
        mappingId: input.mappingId,
        responseMappingId: input.responseMappingId ?? null,
        forwardHeaders: (input.forwardHeaders ?? DEFAULT_FORWARD_HEADERS) as unknown as Prisma.InputJsonValue,
        enabled: input.enabled ?? true
      }
    });
    return toProxyBinding(record);
  }

  public async updateBinding(id: string, input: UpdateProxyBindingRequest): Promise<ProxyBinding | null> {
    const existing = await this.prisma.proxyBinding.findUnique({ where: { id } });
    if (!existing) return null;
    const record = await this.prisma.proxyBinding.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        method: input.method ?? undefined,
        pathPattern: input.pathPattern ?? undefined,
        upstreamBaseUrl: input.upstreamBaseUrl ?? undefined,
        mappingId: input.mappingId ?? undefined,
        responseMappingId: input.responseMappingId === undefined ? undefined : input.responseMappingId,
        forwardHeaders: input.forwardHeaders === undefined ? undefined : (input.forwardHeaders as unknown as Prisma.InputJsonValue),
        enabled: input.enabled ?? undefined
      }
    });
    return toProxyBinding(record);
  }

  public async deleteBinding(id: string): Promise<boolean> {
    const existing = await this.prisma.proxyBinding.findUnique({ where: { id } });
    if (!existing) return false;
    await this.prisma.proxyBinding.delete({ where: { id } });
    return true;
  }

  public async recordProxyRequest(input: RecordProxyRequestInput): Promise<void> {
    await this.prisma.proxyRequestLog.create({
      data: {
        bindingId: input.bindingId,
        appId: input.appId ?? null,
        method: input.method,
        path: input.path,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        upstreamUrl: input.upstreamUrl ?? null,
        transformedRequest: truncateJson(input.transformedRequest),
        responseBody: truncateJson(input.responseBody),
        errors: input.errors as unknown as Prisma.InputJsonValue
      }
    });
  }

  public async createProxyApp(input: CreateProxyAppRequest): Promise<ProxyAppWithKey> {
    const generated = generateApiKey();
    const record = await this.prisma.proxyApp.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        keyHash: generated.hash,
        keyPrefix: generated.prefix,
        scope: input.scope ?? "all",
        bindingIds: (input.bindingIds ?? []) as unknown as Prisma.InputJsonValue,
        enabled: input.enabled ?? true
      }
    });
    return { ...toProxyApp(record), key: generated.plaintext };
  }

  public async listProxyApps(): Promise<readonly ProxyApp[]> {
    const records = await this.prisma.proxyApp.findMany({ orderBy: { createdAt: "asc" } });
    return records.map(toProxyApp);
  }

  public async getProxyApp(id: string): Promise<ProxyApp | null> {
    const record = await this.prisma.proxyApp.findUnique({ where: { id } });
    return record ? toProxyApp(record) : null;
  }

  public async findProxyAppByPlaintextKey(plaintext: string): Promise<ProxyApp | null> {
    const record = await this.prisma.proxyApp.findUnique({ where: { keyHash: hashApiKey(plaintext) } });
    return record ? toProxyApp(record) : null;
  }

  public async updateProxyApp(id: string, input: UpdateProxyAppRequest): Promise<ProxyApp | null> {
    const existing = await this.prisma.proxyApp.findUnique({ where: { id } });
    if (!existing) return null;
    const record = await this.prisma.proxyApp.update({
      where: { id },
      data: {
        name: input.name ?? undefined,
        description: input.description === undefined ? undefined : input.description ?? null,
        scope: input.scope ?? undefined,
        bindingIds: input.bindingIds === undefined ? undefined : (input.bindingIds as unknown as Prisma.InputJsonValue),
        enabled: input.enabled ?? undefined
      }
    });
    return toProxyApp(record);
  }

  public async rotateProxyAppKey(id: string): Promise<ProxyAppWithKey | null> {
    const existing = await this.prisma.proxyApp.findUnique({ where: { id } });
    if (!existing) return null;
    const generated = generateApiKey();
    const record = await this.prisma.proxyApp.update({
      where: { id },
      data: { keyHash: generated.hash, keyPrefix: generated.prefix }
    });
    return { ...toProxyApp(record), key: generated.plaintext };
  }

  public async deleteProxyApp(id: string): Promise<boolean> {
    const existing = await this.prisma.proxyApp.findUnique({ where: { id } });
    if (!existing) return false;
    await this.prisma.proxyApp.delete({ where: { id } });
    return true;
  }

  public async touchProxyAppLastUsed(id: string): Promise<void> {
    await this.prisma.proxyApp.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  public async listProxyRequests(options: { readonly limit?: number; readonly since?: string } = {}): Promise<readonly ProxyRequestLog[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    let where: Prisma.ProxyRequestLogWhereInput | undefined;
    if (options.since) {
      const sinceRecord = await this.prisma.proxyRequestLog.findUnique({ where: { id: options.since } });
      if (sinceRecord) where = { createdAt: { gt: sinceRecord.createdAt } };
    }
    const records = await this.prisma.proxyRequestLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return records.map(toProxyRequestLog);
  }

  public async listActiveBindings(): Promise<readonly ActiveBinding[]> {
    const records = await this.prisma.proxyBinding.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      include: {
        mapping: { include: { versions: true } },
        responseMapping: { include: { versions: true } }
      }
    });

    return records.map((record) => ({
      binding: toProxyBinding(record),
      requestRules: rulesForCurrentVersion(record.mapping),
      responseRules: record.responseMapping ? rulesForCurrentVersion(record.responseMapping) : []
    }));
  }
}

function rulesForCurrentVersion(mapping: MappingRecord): readonly MappingRule[] {
  const current = mapping.versions.find((version) => version.version === mapping.currentVersion);
  return (current?.rules ?? []) as unknown as MappingRule[];
}

function truncateJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_LOGGED_BODY_BYTES) return value as Prisma.InputJsonValue;
  return { truncated: true, bytes: serialized.length, preview: serialized.slice(0, MAX_LOGGED_BODY_BYTES) };
}

function toProxyRequestLog(record: ProxyRequestLogRecord): ProxyRequestLog {
  return {
    id: record.id,
    bindingId: record.bindingId,
    appId: record.appId,
    method: record.method,
    path: record.path,
    statusCode: record.statusCode,
    durationMs: record.durationMs,
    upstreamUrl: record.upstreamUrl,
    transformedRequest: (record.transformedRequest ?? null) as ProxyRequestLog["transformedRequest"],
    responseBody: (record.responseBody ?? null) as ProxyRequestLog["responseBody"],
    errors: (record.errors ?? []) as unknown as string[],
    createdAt: record.createdAt.toISOString()
  };
}

function toProxyApp(record: ProxyAppRecord): ProxyApp {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    keyPrefix: record.keyPrefix,
    scope: record.scope as ProxyAppScope,
    bindingIds: (record.bindingIds ?? []) as unknown as string[],
    enabled: record.enabled,
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toProxyBinding(record: ProxyBindingRecord): ProxyBinding {
  return {
    id: record.id,
    name: record.name,
    method: record.method as ProxyBindingMethod,
    pathPattern: record.pathPattern,
    upstreamBaseUrl: record.upstreamBaseUrl,
    mappingId: record.mappingId,
    responseMappingId: record.responseMappingId,
    forwardHeaders: (record.forwardHeaders ?? []) as unknown as string[],
    enabled: record.enabled,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toMappingDocument(record: MappingRecord): MappingDocument {
  return {
    id: record.id,
    name: record.name,
    sourceSchemaId: record.sourceSchemaId,
    targetSchemaId: record.targetSchemaId,
    currentVersion: record.currentVersion,
    versions: record.versions.map((version) => ({
      version: version.version,
      rules: version.rules as unknown as MappingRule[],
      createdAt: version.createdAt.toISOString()
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toPrismaJson(value: CreateSchemaRequest["content"]): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
