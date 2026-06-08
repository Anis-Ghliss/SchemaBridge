import type { JsonObject, JsonValue, MappingRule, MappingRuleTransform, TransformResult } from "@schemabridge/shared-types";

export interface TransformOptions {
  readonly includeMissingErrors?: boolean;
}

export function transformPayload(input: JsonValue, rules: readonly MappingRule[], options: TransformOptions = {}): TransformResult {
  if (!isRecord(input)) {
    return { status: "error", errors: ["Input payload must be a JSON object."] };
  }

  const output: Record<string, JsonValue> = {};
  const errors: string[] = [];

  for (const rule of rules) {
    const source = getByPath(input, rule.sourcePath);
    const hasValue = source.found;
    const rawValue = hasValue ? source.value : rule.defaultValue;

    if (rawValue === undefined) {
      if (options.includeMissingErrors) {
        errors.push(`Missing source path: ${rule.sourcePath}`);
      }
      continue;
    }

    let value = rawValue;
    if (rule.transform) {
      const transformed = applyTransform(rawValue, rule.transform);
      if (!transformed.ok) {
        errors.push(`Rule ${rule.id} (${rule.transform}) on ${rule.sourcePath}: ${transformed.error}`);
        continue;
      }
      value = transformed.value;
    }

    const setResult = setByPath(output, rule.targetPath, value);
    if (!setResult.ok) {
      errors.push(setResult.error);
    }
  }

  return {
    status: errors.length > 0 ? "error" : "success",
    output,
    errors
  };
}

export function validateMappingRules(rules: readonly MappingRule[]): readonly string[] {
  const errors: string[] = [];
  const seenTargets = new Set<string>();

  for (const rule of rules) {
    if (rule.sourcePath.trim().length === 0) errors.push(`Rule ${rule.id} has an empty source path.`);
    if (rule.targetPath.trim().length === 0) errors.push(`Rule ${rule.id} has an empty target path.`);
    if (seenTargets.has(rule.targetPath)) errors.push(`Target path is mapped more than once: ${rule.targetPath}`);
    seenTargets.add(rule.targetPath);
  }

  return errors;
}

function getByPath(input: JsonObject, path: string): { readonly found: true; readonly value: JsonValue } | { readonly found: false } {
  const segments = path.split(".").filter(Boolean);
  let current: JsonValue = input;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { found: false };
      current = current[index] as JsonValue;
      continue;
    }

    if (!isRecord(current) || !(segment in current)) return { found: false };
    current = current[segment] as JsonValue;
  }

  return { found: true, value: current };
}

function setByPath(output: Record<string, JsonValue>, path: string, value: JsonValue): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return { ok: false, error: "Target path cannot be empty." };

  let current: Record<string, JsonValue> = output;
  for (const [index, segment] of segments.entries()) {
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      current[segment] = value;
      return { ok: true };
    }

    const existing = current[segment];
    if (existing === undefined) {
      const next: Record<string, JsonValue> = {};
      current[segment] = next;
      current = next;
      continue;
    }

    if (!isRecord(existing)) {
      return { ok: false, error: `Cannot set ${path}; ${segments.slice(0, index + 1).join(".")} is not an object.` };
    }
    current = existing;
  }

  return { ok: true };
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyTransform(value: JsonValue, kind: MappingRuleTransform): { readonly ok: true; readonly value: JsonValue } | { readonly ok: false; readonly error: string } {
  switch (kind) {
    case "string": {
      if (value === null) return { ok: true, value: "" };
      if (typeof value === "string") return { ok: true, value };
      if (typeof value === "number" || typeof value === "boolean") return { ok: true, value: String(value) };
      return { ok: false, error: "cannot coerce object/array to string" };
    }
    case "number": {
      if (typeof value === "number") return { ok: true, value };
      if (typeof value === "string") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return { ok: false, error: `cannot coerce "${value}" to number` };
        return { ok: true, value: parsed };
      }
      if (typeof value === "boolean") return { ok: true, value: value ? 1 : 0 };
      return { ok: false, error: "cannot coerce null/object/array to number" };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "number") return { ok: true, value: value !== 0 };
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "y"].includes(normalized)) return { ok: true, value: true };
        if (["false", "0", "no", "n", ""].includes(normalized)) return { ok: true, value: false };
        return { ok: false, error: `cannot coerce "${value}" to boolean` };
      }
      return { ok: false, error: "cannot coerce null/object/array to boolean" };
    }
    case "lowercase": {
      if (typeof value !== "string") return { ok: false, error: "lowercase requires a string source" };
      return { ok: true, value: value.toLowerCase() };
    }
    case "uppercase": {
      if (typeof value !== "string") return { ok: false, error: "uppercase requires a string source" };
      return { ok: true, value: value.toUpperCase() };
    }
    case "iso-date": {
      const candidate = value instanceof Date ? value : new Date(value as string | number);
      if (Number.isNaN(candidate.getTime())) return { ok: false, error: `cannot parse ${JSON.stringify(value)} as date` };
      return { ok: true, value: candidate.toISOString() };
    }
  }
}
