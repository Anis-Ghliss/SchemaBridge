import { Prisma, type PrismaClient } from "@prisma/client";
import { parseSchema } from "@schemabridge/schema-parser";
import type {
  CreateMappingRequest,
  CreateProxyBindingRequest,
  CreateSchemaRequest,
  MappingDocument,
  MappingRule,
  ProxyBinding,
  ProxyBindingMethod,
  SchemaDocument,
  UpdateProxyBindingRequest
} from "@schemabridge/shared-types";

type MappingRecord = Prisma.MappingGetPayload<{ include: { versions: true } }>;
type ProxyBindingRecord = Prisma.ProxyBindingGetPayload<Record<string, never>>;

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
