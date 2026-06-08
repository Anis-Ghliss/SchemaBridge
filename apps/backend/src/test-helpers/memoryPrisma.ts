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
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type WhereId = { where: { id: string } };

export function createMemoryPrisma() {
  const schemas: SchemaRow[] = [];
  const mappings: MappingRow[] = [];
  const versions: MappingVersionRow[] = [];
  const bindings: BindingRow[] = [];

  function getMappingWithVersions(id: string) {
    const mapping = mappings.find((m) => m.id === id);
    if (!mapping) return null;
    return { ...mapping, versions: versions.filter((v) => v.mappingId === id).sort((a, b) => a.version - b.version) };
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
      async findMany({ include }: { include?: unknown } = {}) {
        const sorted = [...mappings].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (include) return sorted.map((m) => getMappingWithVersions(m.id));
        return sorted;
      },
      async findUnique({ where, include }: WhereId & { include?: unknown }) {
        const mapping = mappings.find((m) => m.id === where.id);
        if (!mapping) return null;
        return include ? getMappingWithVersions(mapping.id) : mapping;
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
      }
    },
    mappingVersion: {
      async findUnique({ where }: { where: { mappingId_version: { mappingId: string; version: number } } }) {
        return versions.find((v) => v.mappingId === where.mappingId_version.mappingId && v.version === where.mappingId_version.version) ?? null;
      }
    },
    proxyBinding: {
      async create({ data }: { data: Omit<BindingRow, "id" | "createdAt" | "updatedAt"> }) {
        const now = new Date();
        const row: BindingRow = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
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
          mapping: getMappingWithVersions(row.mappingId),
          responseMapping: row.responseMappingId ? getMappingWithVersions(row.responseMappingId) : null
        }));
      },
      async findUnique({ where }: WhereId) {
        return bindings.find((b) => b.id === where.id) ?? null;
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
      binding(input: Omit<BindingRow, "createdAt" | "updatedAt"> & { createdAt?: Date }) {
        const now = input.createdAt ?? new Date();
        bindings.push({ ...input, createdAt: now, updatedAt: now });
      }
    }
  };
}

export type MemoryPrisma = ReturnType<typeof createMemoryPrisma>;
