import type { DriftFinding, JsonObject, JsonValue, MappingRule, MappingRuleTransform, TransformResult } from "@schemabridge/shared-types";

export interface TransformOptions {
  readonly includeMissingErrors?: boolean;
}

const ARRAY_WILDCARD: unique symbol = Symbol("arrayWildcard");

type PathSegment = string | typeof ARRAY_WILDCARD;

export function transformPayload(input: JsonValue, rules: readonly MappingRule[], options: TransformOptions = {}): TransformResult {
  if (!isRecord(input)) {
    return { status: "error", errors: ["Input payload must be a JSON object."] };
  }

  const output: Record<string, JsonValue> = {};
  const errors: string[] = [];

  for (const rule of rules) {
    const source = getByPath(input, rule.sourcePath);
    const values = source.found
      ? source.matches
      : rule.defaultValue !== undefined
        ? [{ value: rule.defaultValue, indexes: [] }]
        : [];

    if (values.length === 0) {
      if (options.includeMissingErrors) {
        errors.push(`Missing source path: ${rule.sourcePath}`);
      }
      continue;
    }

    for (const match of values) {
      let value = match.value;
      if (rule.transform) {
        const transformed = applyTransform(match.value, rule.transform);
        if (!transformed.ok) {
          errors.push(`Rule ${rule.id} (${rule.transform}) on ${rule.sourcePath}: ${transformed.error}`);
          continue;
        }
        value = transformed.value;
      }

      const setResult = setByPath(output, rule.targetPath, value, match.indexes);
      if (!setResult.ok) {
        errors.push(setResult.error);
      }
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

// Defense-in-depth bound so a deeply nested payload cannot exhaust the stack
// while being validated against an example schema.
const MAX_VALIDATION_DEPTH = 100;

export function validateAgainstExample(value: unknown, example: JsonValue, label: string): readonly string[] {
  const errors: string[] = [];
  visitExample(value, example, label, errors, 0);
  return errors;
}

function getByPath(input: JsonObject, path: string): { readonly found: true; readonly matches: readonly { readonly value: JsonValue; readonly indexes: readonly number[] }[] } | { readonly found: false } {
  const matches = readPath(input, parsePath(path), []);
  return matches.length > 0 ? { found: true, matches } : { found: false };
}

function readPath(value: JsonValue, segments: readonly PathSegment[], indexes: readonly number[]): readonly { readonly value: JsonValue; readonly indexes: readonly number[] }[] {
  if (segments.length === 0) return [{ value, indexes }];
  const [segment, ...rest] = segments;
  if (segment === undefined) return [];

  if (segment === ARRAY_WILDCARD) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => readPath(item, rest, [...indexes, index]));
  }

  if (Array.isArray(value)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0 || index >= value.length) return [];
    return readPath(value[index] as JsonValue, rest, indexes);
  }

  if (!isRecord(value) || !(segment in value)) return [];
  return readPath(value[segment] as JsonValue, rest, indexes);
}

function setByPath(output: Record<string, JsonValue>, path: string, value: JsonValue, indexes: readonly number[]): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const segments = parsePath(path);
  if (segments.length === 0) return { ok: false, error: "Target path cannot be empty." };
  return setAt(output, segments, value, indexes, 0, path);
}

function setAt(current: JsonValue, segments: readonly PathSegment[], value: JsonValue, indexes: readonly number[], wildcardCursor: number, fullPath: string): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  const [segment, ...rest] = segments;
  if (segment === undefined) return { ok: false, error: "Target path cannot be empty." };
  const isLeaf = rest.length === 0;

  if (segment === ARRAY_WILDCARD) {
    if (!Array.isArray(current)) return { ok: false, error: `Cannot set ${fullPath}; expected an array.` };
    const index = indexes[wildcardCursor];
    if (index === undefined) return { ok: false, error: `Cannot set ${fullPath}; target array has no source index.` };
    if (isLeaf) {
      current[index] = value;
      return { ok: true };
    }
    current[index] ??= containerFor(rest[0]);
    return setAt(current[index] as JsonValue, rest, value, indexes, wildcardCursor + 1, fullPath);
  }

  if (Array.isArray(current)) {
    const index = Number(segment);
    if (!Number.isInteger(index) || index < 0) return { ok: false, error: `Cannot set ${fullPath}; ${segment} is not a valid array index.` };
    if (isLeaf) {
      current[index] = value;
      return { ok: true };
    }
    current[index] ??= containerFor(rest[0]);
    return setAt(current[index] as JsonValue, rest, value, indexes, wildcardCursor, fullPath);
  }

  if (!isRecord(current)) return { ok: false, error: `Cannot set ${fullPath}; target parent is not an object.` };
  const object = current as Record<string, JsonValue>;
  if (isLeaf) {
    object[segment] = value;
    return { ok: true };
  }

  const existing = object[segment];
  if (existing === undefined) {
    object[segment] = containerFor(rest[0]);
  } else if (!isCompatibleContainer(existing, rest[0])) {
    return { ok: false, error: `Cannot set ${fullPath}; ${segment} is not an ${rest[0] === ARRAY_WILDCARD ? "array" : "object"}.` };
  }

  return setAt(object[segment] as JsonValue, rest, value, indexes, wildcardCursor, fullPath);
}

function parsePath(path: string): readonly PathSegment[] {
  const segments: PathSegment[] = [];
  for (const segment of path.split(".").filter(Boolean)) {
    if (segment.endsWith("[]")) {
      const key = segment.slice(0, -2);
      if (key) segments.push(key);
      segments.push(ARRAY_WILDCARD);
    } else {
      segments.push(segment);
    }
  }
  return segments;
}

function containerFor(next: PathSegment | undefined): JsonValue {
  return next === ARRAY_WILDCARD ? [] : {};
}

function isCompatibleContainer(value: JsonValue, next: PathSegment | undefined): boolean {
  if (next === ARRAY_WILDCARD) return Array.isArray(value);
  return isRecord(value) || Array.isArray(value);
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function visitExample(value: unknown, example: JsonValue, path: string, errors: string[], depth: number): void {
  if (depth >= MAX_VALIDATION_DEPTH) {
    errors.push(`${path} exceeds the maximum supported nesting depth`);
    return;
  }

  if (Array.isArray(example)) {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (example.length === 0 || value.length === 0) return;
    const itemExample = example[0] as JsonValue;
    value.forEach((item, index) => visitExample(item, itemExample, `${path}[${index}]`, errors, depth + 1));
    return;
  }

  if (isRecord(example)) {
    if (!isUnknownRecord(value)) {
      errors.push(`${path} must be an object`);
      return;
    }
    for (const [key, childExample] of Object.entries(example)) {
      if (!(key in value)) {
        errors.push(`${joinPath(path, key)} is required`);
        continue;
      }
      visitExample(value[key], childExample as JsonValue, joinPath(path, key), errors, depth + 1);
    }
    return;
  }

  if (example === null) {
    if (value !== null) errors.push(`${path} must be null`);
    return;
  }

  const expectedType = typeof example;
  if (typeof value !== expectedType) {
    errors.push(`${path} must be ${expectedType}`);
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_DRIFT_DEPTH = 100;

/**
 * Structurally compare an observed payload against an example schema and return
 * the ways it diverges. Unlike validateAgainstExample (which only flags missing
 * and mistyped fields), this also surfaces *added* fields — the field that an
 * upstream silently introduced — which is the primary contract-drift signal.
 *
 * Array element paths collapse to a `[]` wildcard and findings are de-duplicated,
 * so drift is reported at contract granularity rather than per array index.
 */
export function diffShape(observed: unknown, example: JsonValue, basePath = ""): readonly DriftFinding[] {
  const findings: DriftFinding[] = [];
  walkDiff(observed, example, basePath, findings, 0);
  return dedupeFindings(findings);
}

function walkDiff(observed: unknown, example: JsonValue, path: string, findings: DriftFinding[], depth: number): void {
  if (depth >= MAX_DRIFT_DEPTH) return;
  const here = path.length > 0 ? path : "$";

  if (Array.isArray(example)) {
    if (!Array.isArray(observed)) {
      findings.push({ kind: "type-changed", path: here, expectedType: "array", observedType: shapeTypeOf(observed) });
      return;
    }
    if (example.length === 0) return;
    const itemExample = example[0] as JsonValue;
    for (const item of observed) {
      walkDiff(item, itemExample, `${path}[]`, findings, depth + 1);
    }
    return;
  }

  if (isRecord(example)) {
    if (!isUnknownRecord(observed)) {
      findings.push({ kind: "type-changed", path: here, expectedType: "object", observedType: shapeTypeOf(observed) });
      return;
    }
    for (const [key, childExample] of Object.entries(example)) {
      const childPath = joinPath(path, key);
      if (!(key in observed)) {
        findings.push({ kind: "missing", path: childPath, expectedType: shapeTypeOf(childExample) });
      } else {
        walkDiff(observed[key], childExample as JsonValue, childPath, findings, depth + 1);
      }
    }
    for (const key of Object.keys(observed)) {
      if (!(key in example)) {
        findings.push({ kind: "added", path: joinPath(path, key), observedType: shapeTypeOf(observed[key]) });
      }
    }
    return;
  }

  // example is a primitive (or null): only the leaf type matters.
  const expectedType = shapeTypeOf(example);
  const observedType = shapeTypeOf(observed);
  if (observedType !== expectedType) {
    findings.push({ kind: "type-changed", path: here, expectedType, observedType });
  }
}

function shapeTypeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function dedupeFindings(findings: readonly DriftFinding[]): DriftFinding[] {
  const seen = new Map<string, DriftFinding>();
  for (const finding of findings) {
    const key = `${finding.kind}|${finding.path}|${finding.expectedType ?? ""}|${finding.observedType ?? ""}`;
    if (!seen.has(key)) seen.set(key, finding);
  }
  return [...seen.values()];
}

function joinPath(parent: string, key: string): string {
  return parent.length > 0 ? `${parent}.${key}` : key;
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
