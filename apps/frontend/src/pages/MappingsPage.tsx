import { ArrowLeft, ArrowRight, Check, GitBranch, Plus, RotateCcw, Save, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { parseSchema } from "@schemabridge/schema-parser";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { SchemaTree } from "../components/SchemaTree";
import { MappingCanvas } from "../components/MappingCanvas";
import { EmptyState } from "../components/EmptyState";
import { suggestMappings } from "../lib/suggestMappings";

export function MappingsPage() {
  const { mappings, selectedMappingId } = useAppStore();
  if (selectedMappingId) {
    const found = mappings.find((mapping) => mapping.id === selectedMappingId);
    if (found) return <MappingDetail mappingId={selectedMappingId} />;
  }
  return <MappingList />;
}

function MappingList() {
  const { mappings, schemas, bindings, selectMapping } = useAppStore();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const usedBy = useMemo(() => {
    const counts = new Map<string, number>();
    for (const binding of bindings) {
      counts.set(binding.mappingId, (counts.get(binding.mappingId) ?? 0) + 1);
      if (binding.responseMappingId) counts.set(binding.responseMappingId, (counts.get(binding.responseMappingId) ?? 0) + 1);
    }
    return counts;
  }, [bindings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mappings;
    return mappings.filter((mapping) => mapping.name.toLowerCase().includes(q));
  }, [mappings, query]);

  if (creating) return <NewMapping onCancel={() => setCreating(false)} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search mappings…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)} disabled={schemas.length < 2}><Plus className="h-4 w-4" /> New mapping</Button>
      </div>

      {filtered.length === 0 ? (
        mappings.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="No mappings yet"
            description={schemas.length < 2 ? "Create at least two schemas first — one source, one target." : "Create a mapping to translate between two schemas."}
            action={schemas.length >= 2 ? <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New mapping</Button> : undefined}
          />
        ) : (
          <p className="px-1 py-6 text-sm text-slate-500">No mappings match "{query}".</p>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_120px_120px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Name</span>
            <span>Source → target</span>
            <span>Rules</span>
            <span>Used by</span>
          </div>
          {filtered.map((mapping) => {
            const source = schemas.find((s) => s.id === mapping.sourceSchemaId);
            const target = schemas.find((s) => s.id === mapping.targetSchemaId);
            const currentVersion = mapping.versions.find((v) => v.version === mapping.currentVersion);
            return (
              <button
                key={mapping.id}
                type="button"
                onClick={() => selectMapping(mapping.id)}
                className="grid w-full grid-cols-[1.5fr_1fr_120px_120px] items-center gap-3 border-b border-border px-5 py-3 text-left text-sm last:border-b-0 hover:bg-muted/30"
              >
                <span className="truncate font-medium">{mapping.name}</span>
                <span className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                  <span className="truncate">{source?.name ?? "?"}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate">{target?.name ?? "?"}</span>
                </span>
                <span className="text-xs text-slate-500">{currentVersion?.rules.length ?? 0}</span>
                <span className="text-xs text-slate-500">{usedBy.get(mapping.id) ?? 0} binding{usedBy.get(mapping.id) === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );
}

function NewMapping({ onCancel }: { readonly onCancel: () => void }) {
  const { schemas, createMapping, selectMapping } = useAppStore();
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState(schemas[0]?.id ?? "");
  const [targetId, setTargetId] = useState(schemas[1]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const canSave = name.trim().length > 0 && sourceId && targetId && sourceId !== targetId;

  async function save() {
    setError(undefined);
    if (!canSave) {
      setError("Pick a name, source, and target (must differ).");
      return;
    }
    setSaving(true);
    try {
      const source = schemas.find((s) => s.id === sourceId)!;
      const target = schemas.find((s) => s.id === targetId)!;
      const suggested = suggestMappings(source.fields, target.fields);
      const mapping = await createMapping({ name: name.trim(), sourceSchemaId: sourceId, targetSchemaId: targetId, rules: suggested });
      onCancel();
      selectMapping(mapping.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to mappings
      </button>
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">New mapping</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs lg:col-span-2">
            <span className="font-medium text-slate-600">Name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer v1 → v2" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Source schema</span>
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Target schema</span>
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {schemas.map((schema) => <option key={schema.id} value={schema.id}>{schema.name}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Field mappings will be suggested by name similarity — you can adjust them after creation.</p>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>{saving ? "Saving…" : "Create mapping"}</Button>
        </div>
      </Card>
    </div>
  );
}

function MappingDetail({ mappingId }: { readonly mappingId: string }) {
  const { mappings, schemas, bindings, activeMapping, rules, selectMapping, selectBinding, setView, setRules, setActiveMapping, saveVersion, restoreVersion, removeMapping } = useAppStore();
  const mapping = mappings.find((item) => item.id === mappingId);
  const [selected, setSelected] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mapping && activeMapping?.id !== mapping.id) setActiveMapping(mapping.id);
  }, [mapping, activeMapping, setActiveMapping]);

  const persistedRules = useMemo(() => mapping?.versions.find((version) => version.version === mapping.currentVersion)?.rules ?? [], [mapping]);
  const isDirty = useMemo(() => !rulesEqual(rules, persistedRules), [rules, persistedRules]);

  if (!mapping) return null;
  const source = schemas.find((s) => s.id === mapping.sourceSchemaId);
  const target = schemas.find((s) => s.id === mapping.targetSchemaId);
  const dependents = bindings.filter((b) => b.mappingId === mapping.id || b.responseMappingId === mapping.id);

  if (!source || !target) return null;
  const sourceFields = source.fields ?? parseSchema(source.content).fields;
  const targetFields = target.fields ?? parseSchema(target.content).fields;

  function suggest() {
    setRules(suggestMappings(sourceFields, targetFields));
  }

  async function save() {
    setSaving(true);
    try {
      await saveVersion();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!mapping) return;
    if (dependents.length > 0) {
      window.alert(`Can't delete — used by ${dependents.length} binding(s). Remove or repoint them first.`);
      return;
    }
    if (!window.confirm(`Delete mapping "${mapping.name}"?`)) return;
    try {
      await removeMapping(mapping.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => selectMapping(undefined)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to mappings
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">{mapping.name}</h2>
            <p className="text-xs text-slate-500">{source.name} <span className="text-slate-400">→</span> {target.name}</p>
          </div>
          {isDirty ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <Check className="h-3 w-3" /> Saved · v{mapping.currentVersion}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={suggest}>
            <Sparkles className="h-3.5 w-3.5" /> Suggest by name
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!isDirty || saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save mapping"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void remove()} disabled={dependents.length > 0} title={dependents.length > 0 ? `Used by ${dependents.length} binding(s)` : undefined}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      {mapping.versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Versions</span>
          {mapping.versions.map((version) => (
            <Button
              key={version.version}
              variant={version.version === mapping.currentVersion ? "primary" : "ghost"}
              size="sm"
              onClick={() => restoreVersion(version.version)}
            >
              <RotateCcw className="h-3 w-3" /> v{version.version}
            </Button>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[240px_1fr_240px]">
          <div className="rounded-md border border-border bg-white p-3">
            <SchemaTree title="Source" fields={sourceFields} selected={selected} onSelect={setSelected} />
          </div>
          <MappingCanvas sourceFields={sourceFields} targetFields={targetFields} rules={rules} onRulesChange={setRules} />
          <div className="rounded-md border border-border bg-white p-3">
            <SchemaTree title="Target" fields={targetFields} selected={selected} onSelect={setSelected} />
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{rules.length} rule{rules.length === 1 ? "" : "s"} defined.</p>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Used by</h3>
        {dependents.length === 0 ? (
          <p className="text-xs text-slate-500">No bindings reference this mapping yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {dependents.map((binding) => (
              <li key={binding.id}>
                <button
                  type="button"
                  onClick={() => { setView("bindings"); selectBinding(binding.id); }}
                  className="flex w-full items-center gap-3 rounded-md border border-border bg-white px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <span className="font-mono text-[11px] text-slate-600">{binding.method} {binding.pathPattern}</span>
                  <span className="text-slate-400">→</span>
                  <span className="truncate font-mono text-[11px] text-slate-600">{binding.upstreamBaseUrl}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function rulesEqual(a: readonly { readonly sourcePath: string; readonly targetPath: string; readonly defaultValue?: unknown; readonly transform?: unknown }[], b: readonly { readonly sourcePath: string; readonly targetPath: string; readonly defaultValue?: unknown; readonly transform?: unknown }[]): boolean {
  if (a.length !== b.length) return false;
  const normalize = (rules: typeof a) => rules
    .map((rule) => JSON.stringify({ s: rule.sourcePath, t: rule.targetPath, d: rule.defaultValue ?? null, x: rule.transform ?? null }))
    .sort()
    .join("|");
  return normalize(a) === normalize(b);
}
