import type { MappingRule, SchemaField } from "@schemabridge/shared-types";

const STOP_WORDS = new Set(["the", "a", "an", "of", "to", "in", "on"]);

export function suggestMappings(sourceFields: readonly SchemaField[], targetFields: readonly SchemaField[]): readonly MappingRule[] {
  const sourceLeaves = flattenLeaves(sourceFields);
  const targetLeaves = flattenLeaves(targetFields);
  const used = new Set<string>();
  const rules: MappingRule[] = [];

  const targetByScore = targetLeaves
    .map((target) => {
      const best = bestMatch(target, sourceLeaves);
      return best ? { target, source: best.source, score: best.score } : null;
    })
    .filter((value): value is { target: SchemaField; source: SchemaField; score: number } => value !== null)
    .sort((a, b) => b.score - a.score);

  for (const candidate of targetByScore) {
    if (used.has(candidate.source.path)) continue;
    used.add(candidate.source.path);
    rules.push({ id: crypto.randomUUID(), sourcePath: candidate.source.path, targetPath: candidate.target.path });
  }

  return rules;
}

function bestMatch(target: SchemaField, sources: readonly SchemaField[]): { readonly source: SchemaField; readonly score: number } | null {
  const targetTokens = tokensFor(target.path);
  let best: { source: SchemaField; score: number } | null = null;
  for (const source of sources) {
    const score = similarity(targetTokens, tokensFor(source.path));
    if (score === 0) continue;
    if (!best || score > best.score) best = { source, score };
  }
  return best;
}

function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  if (intersection === 0) return 0;
  const lastEqual = a[a.length - 1] === b[b.length - 1] ? 0.25 : 0;
  return intersection / Math.max(setA.size, setB.size) + lastEqual;
}

function tokensFor(path: string): readonly string[] {
  return path
    .split(/[.\s]+/)
    .flatMap((segment) => segment.split(/(?=[A-Z])|_|-/))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function flattenLeaves(fields: readonly SchemaField[]): readonly SchemaField[] {
  return fields.flatMap((field) => (field.children.length === 0 ? [field] : flattenLeaves(field.children)));
}
