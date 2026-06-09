import { randomUUID } from "node:crypto";

interface SchemaRow {
  id: string;
  name: string;
  content: unknown;
  fields: unknown;
  createdAt: Date;
}

interface MappingVersionRow {
  id: string;
  mappingId: string;
  version: number;
  rules: unknown;
  createdAt: Date;
}

interface MappingRow {
  id: string;
  name: string;
  sourceSchemaId: string;
  targetSchemaId: string;
  currentVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BindingRow {
  id: string;
  name: string;
  method: string;
  pathPattern: string;
  upstreamBaseUrl: string;
  mappingId: string;
  responseMappingId: string | null;
  forwardHeaders: unknown;
  validationMode: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProxyRequestLogRow {
  id: string;
  bindingId: string | null;
  appId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  upstreamUrl: string | null;
  incomingRequest: unknown;
  transformedRequest: unknown;
  responseBody: unknown;
  errors: unknown;
  createdAt: Date;
}

interface ProxyAppRow {
  id: string;
  name: string;
  description: string | null;
  keyHash: string;
  keyPrefix: string;
  scope: string;
  bindingIds: unknown;
  enabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type WhereId = { where: { id: string } };

export function createMemoryPrisma() {
  const schemas: SchemaRow[] = [];
  const mappings: MappingRow[] = [];
  const versions: MappingVersionRow[] = [];
  const bindings: BindingRow[] = [];
  const proxyLogs: ProxyRequestLogRow[] = [];
  const proxyApps: ProxyAppRow[] = [];

  function getMappingWithVersions(id: string) {
    const mapping = mappings.find((m) => m.id === id);
    if (!mapping) return null;
    return { ...mapping, versions: versions.filter((v) => v.mappingId === id).sort((a, b) => a.version - b.version) };
  }

  function getMappingWithRelations(id: string) {
    const mapping = getMappingWithVersions(id);
    if (!mapping) return null;
    return {
      ...mapping,
      sourceSchema: schemas.find((schema) => schema.id === mapping.sourceSchemaId),
      targetSchema: schemas.find((schema) => schema.id === mapping.targetSchemaId)
    };
  }

  return {
    schemaDocument: {
      async create({ data }: { data: { name: string; content: unknown; fields: unknown } }) {
        const row: SchemaRow = { id: randomUUID(), name: data.name, content: data.content, fields: data.fields, createdAt: new Date() };
        schemas.push(row);
        return row;
      },
      async findMany() {
        return [...schemas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
      async findUnique({ where }: WhereId) {
        return schemas.find((s) => s.id === where.id) ?? null;
      },
      async delete({ where }: WhereId) {
        const index = schemas.findIndex((s) => s.id === where.id);
        if (index < 0) throw new Error("not found");
        return schemas.splice(index, 1)[0];
      }
    },
    mapping: {
      async create({ data, include }: { data: { name: string; sourceSchemaId: string; targetSchemaId: string; versions: { create: { version?: number; rules: unknown } } }; include?: unknown }) {
        const now = new Date();
        const row: MappingRow = {
          id: randomUUID(),
          name: data.name,
          sourceSchemaId: data.sourceSchemaId,
          targetSchemaId: data.targetSchemaId,
          currentVersion: 1,
          createdAt: now,
          updatedAt: now
        };
        mappings.push(row);
        const version: MappingVersionRow = { id: randomUUID(), mappingId: row.id, version: data.versions.create.version ?? 1, rules: data.versions.create.rules, createdAt: now };
        versions.push(version);
        if (include) return getMappingWithVersions(row.id);
        return row;
      },
      async findMany({ where, include, select }: { where?: { OR?: Array<{ sourceSchemaId?: string; targetSchemaId?: string }> }; include?: unknown; select?: unknown } = {}) {
        let rows = [...mappings];
        if (where?.OR) {
          rows = rows.filter((row) => where.OR!.some((condition) => (
            (condition.sourceSchemaId !== undefined && row.sourceSchemaId === condition.sourceSchemaId)
            || (condition.targetSchemaId !== undefined && row.targetSchemaId === condition.targetSchemaId)
          )));
        }
        const sorted = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (select) return sorted.map((mapping) => ({ id: mapping.id }));
        if (include) return sorted.map((m) => getMappingWithVersions(m.id));
        return sorted;
      },
      async findUnique({ where, include }: WhereId & { include?: unknown }) {
        const mapping = mappings.find((m) => m.id === where.id);
        if (!mapping) return null;
        return include ? getMappingWithVersions(mapping.id) : mapping;
      },
      async findFirst({ where, select }: { where: { OR: Array<{ sourceSchemaId?: string; targetSchemaId?: string }> }; select?: unknown }) {
        const mapping = mappings.find((row) => where.OR.some((condition) => (
          (condition.sourceSchemaId !== undefined && row.sourceSchemaId === condition.sourceSchemaId)
          || (condition.targetSchemaId !== undefined && row.targetSchemaId === condition.targetSchemaId)
        )));
        if (!mapping) return null;
        if (select) return { id: mapping.id, name: mapping.name };
        return mapping;
      },
      async update({ where, data, include }: WhereId & { data: { currentVersion?: number; versions?: { create: { version: number; rules: unknown } } }; include?: unknown }) {
        const mapping = mappings.find((m) => m.id === where.id);
        if (!mapping) throw new Error("not found");
        if (data.currentVersion !== undefined) mapping.currentVersion = data.currentVersion;
        if (data.versions?.create) {
          versions.push({ id: randomUUID(), mappingId: mapping.id, version: data.versions.create.version, rules: data.versions.create.rules, createdAt: new Date() });
        }
        mapping.updatedAt = new Date();
        return include ? getMappingWithVersions(mapping.id) : mapping;
      },
      async delete({ where }: WhereId) {
        const index = mappings.findIndex((m) => m.id === where.id);
        if (index < 0) throw new Error("not found");
        const deleted = mappings.splice(index, 1)[0];
        for (let versionIndex = versions.length - 1; versionIndex >= 0; versionIndex -= 1) {
          if (versions[versionIndex]?.mappingId === where.id) versions.splice(versionIndex, 1);
        }
        return deleted;
      }
    },
    mappingVersion: {
      async findUnique({ where }: { where: { mappingId_version: { mappingId: string; version: number } } }) {
        return versions.find((v) => v.mappingId === where.mappingId_version.mappingId && v.version === where.mappingId_version.version) ?? null;
      },
      async update({ where, data }: { where: { mappingId_version: { mappingId: string; version: number } }; data: { rules: unknown } }) {
        const version = versions.find((v) => v.mappingId === where.mappingId_version.mappingId && v.version === where.mappingId_version.version);
        if (!version) throw new Error("not found");
        version.rules = data.rules;
        return version;
      }
    },
    proxyBinding: {
      async create({ data }: { data: Omit<BindingRow, "id" | "createdAt" | "updatedAt"> }) {
        const now = new Date();
        const row: BindingRow = { ...data, validationMode: data.validationMode ?? "off", id: randomUUID(), createdAt: now, updatedAt: now };
        bindings.push(row);
        return row;
      },
      async findMany({ where, include }: { where?: { enabled?: boolean }; include?: unknown } = {}) {
        let rows = [...bindings];
        if (where?.enabled !== undefined) rows = rows.filter((b) => b.enabled === where.enabled);
        rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (!include) return rows;
        return rows.map((row) => ({
          ...row,
          mapping: getMappingWithRelations(row.mappingId),
          responseMapping: row.responseMappingId ? getMappingWithRelations(row.responseMappingId) : null
        }));
      },
      async findUnique({ where }: WhereId) {
        return bindings.find((b) => b.id === where.id) ?? null;
      },
      async findFirst({ where, select }: { where: { OR: Array<{ mappingId?: string; responseMappingId?: string }> }; select?: unknown }) {
        const binding = bindings.find((row) => where.OR.some((condition) => (
          (condition.mappingId !== undefined && row.mappingId === condition.mappingId)
          || (condition.responseMappingId !== undefined && row.responseMappingId === condition.responseMappingId)
        )));
        if (!binding) return null;
        if (select) return { id: binding.id, name: binding.name };
        return binding;
      },
      async update({ where, data }: WhereId & { data: Partial<BindingRow> }) {
        const row = bindings.find((b) => b.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        row.updatedAt = new Date();
        return row;
      },
      async delete({ where }: WhereId) {
        const index = bindings.findIndex((b) => b.id === where.id);
        if (index < 0) throw new Error("not found");
        return bindings.splice(index, 1)[0];
      },
      async deleteMany({ where }: { where: { mappingId?: string } }) {
        const before = bindings.length;
        for (let index = bindings.length - 1; index >= 0; index -= 1) {
          if (where.mappingId !== undefined && bindings[index]?.mappingId === where.mappingId) bindings.splice(index, 1);
        }
        return { count: before - bindings.length };
      },
      async updateMany({ where, data }: { where: { responseMappingId?: string }; data: Partial<BindingRow> }) {
        let count = 0;
        for (const binding of bindings) {
          if (where.responseMappingId !== undefined && binding.responseMappingId === where.responseMappingId) {
            Object.assign(binding, data);
            binding.updatedAt = new Date();
            count += 1;
          }
        }
        return { count };
      }
    },
    proxyRequestLog: {
      async create({ data }: { data: Omit<ProxyRequestLogRow, "id" | "createdAt" | "appId" | "incomingRequest"> & { appId?: string | null; incomingRequest?: unknown } }) {
        const row: ProxyRequestLogRow = { ...data, incomingRequest: data.incomingRequest ?? null, appId: data.appId ?? null, id: randomUUID(), createdAt: new Date() };
        proxyLogs.push(row);
        return row;
      },
      async findMany({ where, take }: { where?: { createdAt?: { gt: Date } }; orderBy?: unknown; take?: number } = {}) {
        let rows = [...proxyLogs];
        if (where?.createdAt?.gt) rows = rows.filter((row) => row.createdAt > where.createdAt!.gt);
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (typeof take === "number") rows = rows.slice(0, take);
        return rows;
      },
      async findUnique({ where }: WhereId) {
        return proxyLogs.find((row) => row.id === where.id) ?? null;
      },
      async deleteMany({ where }: { where: { createdAt?: { lt: Date } } }) {
        const before = proxyLogs.length;
        if (where.createdAt?.lt) {
          for (let index = proxyLogs.length - 1; index >= 0; index -= 1) {
            const row = proxyLogs[index];
            if (row && row.createdAt < where.createdAt.lt) proxyLogs.splice(index, 1);
          }
        }
        return { count: before - proxyLogs.length };
      }
    },
    proxyApp: {
      async create({ data }: { data: Omit<ProxyAppRow, "id" | "createdAt" | "updatedAt" | "lastUsedAt"> }) {
        const now = new Date();
        const row: ProxyAppRow = { ...data, id: randomUUID(), lastUsedAt: null, createdAt: now, updatedAt: now };
        proxyApps.push(row);
        return row;
      },
      async findMany({ orderBy }: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) {
        const rows = [...proxyApps];
        if (orderBy?.createdAt === "desc") rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        else rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return rows;
      },
      async findUnique({ where }: { where: { id?: string; keyHash?: string } }) {
        if (where.id) return proxyApps.find((row) => row.id === where.id) ?? null;
        if (where.keyHash) return proxyApps.find((row) => row.keyHash === where.keyHash) ?? null;
        return null;
      },
      async update({ where, data }: { where: { id: string }; data: Partial<ProxyAppRow> }) {
        const row = proxyApps.find((item) => item.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        row.updatedAt = new Date();
        return row;
      },
      async delete({ where }: { where: { id: string } }) {
        const index = proxyApps.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("not found");
        return proxyApps.splice(index, 1)[0];
      }
    },
    seed: {
      schema(input: Omit<SchemaRow, "createdAt"> & { createdAt?: Date }) {
        schemas.push({ ...input, createdAt: input.createdAt ?? new Date() });
      },
      mapping(input: Omit<MappingRow, "createdAt" | "updatedAt"> & { rules: unknown; createdAt?: Date }) {
        const now = input.createdAt ?? new Date();
        mappings.push({ id: input.id, name: input.name, sourceSchemaId: input.sourceSchemaId, targetSchemaId: input.targetSchemaId, currentVersion: input.currentVersion, createdAt: now, updatedAt: now });
        versions.push({ id: randomUUID(), mappingId: input.id, version: input.currentVersion, rules: input.rules, createdAt: now });
      },
      binding(input: Omit<BindingRow, "createdAt" | "updatedAt" | "validationMode"> & { validationMode?: string; createdAt?: Date }) {
        const now = input.createdAt ?? new Date();
        bindings.push({ ...input, validationMode: input.validationMode ?? "off", createdAt: now, updatedAt: now });
      },
      app(input: Omit<ProxyAppRow, "createdAt" | "updatedAt" | "lastUsedAt"> & { createdAt?: Date; lastUsedAt?: Date | null }) {
        const now = input.createdAt ?? new Date();
        proxyApps.push({ ...input, lastUsedAt: input.lastUsedAt ?? null, createdAt: now, updatedAt: now });
      }
    }
  };
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>;
