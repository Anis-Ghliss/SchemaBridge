import { ArrowLeft, Layers3, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import type { MappingDocument, SchemaDocument } from "@schemabridge/shared-types";
import { parseJsonText } from "@schemabridge/schema-parser";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { JsonEditor } from "../components/JsonEditor";
import { SchemaTree } from "../components/SchemaTree";
import { EmptyState } from "../components/EmptyState";

export function SchemasPage() {
  const { schemas, mappings, selectedSchemaId, selectSchema } = useAppStore();

  if (selectedSchemaId) {
    const schema = schemas.find((item) => item.id === selectedSchemaId);
    if (!schema) {
      selectSchema(undefined);
      return null;
    }
    return <SchemaDetail schemaId={selectedSchemaId} />;
  }

  return <SchemaList schemas={schemas} mappings={mappings} />;
}

function SchemaList({ schemas, mappings }: { readonly schemas: readonly SchemaDocument[]; readonly mappings: readonly MappingDocument[] }) {
  const { selectSchema } = useAppStore();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const mapping of mappings) {
      counts.set(mapping.sourceSchemaId, (counts.get(mapping.sourceSchemaId) ?? 0) + 1);
      counts.set(mapping.targetSchemaId, (counts.get(mapping.targetSchemaId) ?? 0) + 1);
    }
    return counts;
  }, [mappings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return schemas;
    return schemas.filter((schema) => schema.name.toLowerCase().includes(q));
  }, [schemas, query]);

  if (creating) return <NewSchema onDone={() => setCreating(false)} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search schemas…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New schema</Button>
      </div>

      {filtered.length === 0 ? (
        schemas.length === 0 ? (
          <EmptyState
            icon={Layers3}
            title="No schemas yet"
            description="Schemas capture the shape of a JSON payload — the source and target of every mapping."
            action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New schema</Button>}
          />
        ) : (
          <p className="px-1 py-6 text-sm text-slate-500">No schemas match "{query}".</p>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_180px_180px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Name</span>
            <span>Used in</span>
            <span>Created</span>
          </div>
          {filtered.map((schema) => (
            <button
              key={schema.id}
              type="button"
              onClick={() => selectSchema(schema.id)}
              className="grid w-full grid-cols-[1fr_180px_180px] items-center gap-3 border-b border-border px-5 py-3 text-left text-sm last:border-b-0 hover:bg-muted/30"
            >
              <span className="truncate font-medium">{schema.name}</span>
              <span className="text-xs text-slate-500">{usage.get(schema.id) ?? 0} mapping{usage.get(schema.id) === 1 ? "" : "s"}</span>
              <span className="text-xs text-slate-500">{new Date(schema.createdAt).toLocaleDateString()}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function NewSchema({ onDone }: { readonly onDone: () => void }) {
  const { createSchema, selectSchema } = useAppStore();
  const [name, setName] = useState("");
  const [text, setText] = useState("{\n  \n}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setError(undefined);
    const parsed = parseJsonText(text);
    if (parsed.error || parsed.value === undefined) {
      setError(parsed.error ?? "Invalid JSON");
      return;
    }
    if (name.trim().length === 0) {
      setError("Give the schema a name.");
      return;
    }
    setSaving(true);
    try {
      const created = await createSchema({ name: name.trim(), content: parsed.value });
      onDone();
      selectSchema(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save schema.");
    } finally {
      setSaving(false);
    }
  }

  async function readFile(file: File) {
    setText(await file.text());
    if (name.trim().length === 0) setName(file.name.replace(/\.json$/i, ""));
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onDone} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to schemas
      </button>
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">New schema</h2>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Name</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer v1" />
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Upload JSON
              <input className="hidden" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
            </label>
          </div>
          <JsonEditor value={text} onChange={setText} label="Example payload" minHeight="240px" maxHeight="360px" />
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save schema"}</Button>
        </div>
      </Card>
    </div>
  );
}

function SchemaDetail({ schemaId }: { readonly schemaId: string }) {
  const { schemas, mappings, selectSchema, setView, selectMapping } = useAppStore();
  const schema = schemas.find((item) => item.id === schemaId);
  if (!schema) return null;

  const dependents = mappings.filter((mapping) => mapping.sourceSchemaId === schemaId || mapping.targetSchemaId === schemaId);

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => selectSchema(undefined)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to schemas
      </button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{schema.name}</h2>
          <p className="text-xs text-slate-500">Created {new Date(schema.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Example payload</h3>
          <JsonEditor value={JSON.stringify(schema.content, null, 2)} onChange={() => undefined} label="Read-only" minHeight="280px" maxHeight="500px" />
          <p className="mt-2 text-[11px] text-slate-500">Schema content is read-only here for now. Replace via Quick start or by creating a new schema.</p>
        </Card>
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Field tree</h3>
            <SchemaTree title="" fields={schema.fields} />
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Dependents</h3>
            {dependents.length === 0 ? (
              <p className="text-xs text-slate-500">Not used by any mapping yet.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {dependents.map((mapping) => (
                  <li key={mapping.id}>
                    <button
                      type="button"
                      onClick={() => { setView("mappings"); selectMapping(mapping.id); }}
                      className="block w-full truncate rounded-md border border-border bg-white px-2.5 py-1.5 text-left hover:bg-muted"
                    >
                      {mapping.name}
                      <span className="ml-1 text-slate-400">{mapping.sourceSchemaId === schemaId ? "(source)" : "(target)"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
