import type { JsonValue, SchemaField, SchemaFieldKind } from "@schemabridge/shared-types";

export interface ParseSchemaResult {
  readonly fields: readonly SchemaField[];
  readonly errors: readonly string[];
}

export function parseJsonText(text: string): { readonly value?: JsonValue; readonly error?: string } {
  try {
    return { value: JSON.parse(text) as JsonValue };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return { error: message };
  }
}

export function parseSchema(value: JsonValue): ParseSchemaResult {
  return { fields: buildFields(value, ""), errors: [] };
}

function buildFields(value: JsonValue, basePath: string): readonly SchemaField[] {
  if (Array.isArray(value)) {
    const sample = value[0];
    const item = sample === undefined ? undefined : buildField("[]", `${basePath}[]`, sample);
    return item ? [item] : [];
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([key, child]) => buildField(key, joinPath(basePath, key), child));
  }

  return [];
}

function buildField(label: string, path: string, value: JsonValue): SchemaField {
  if (Array.isArray(value)) {
    const sample = value[0];
    const item = sample === undefined ? undefined : buildField("item", `${path}[]`, sample);
    return {
      path,
      label,
      kind: "array",
      children: item ? [item] : [],
      ...(item ? { item } : {})
    };
  }

  if (isRecord(value)) {
    return {
      path,
      label,
      kind: "object",
      children: buildFields(value, path)
    };
  }

  return {
    path,
    label,
    kind: kindOf(value),
    children: []
  };
}

function kindOf(value: JsonValue): SchemaFieldKind {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function joinPath(parent: string, key: string): string {
  return parent.length > 0 ? `${parent}.${key}` : key;
}
