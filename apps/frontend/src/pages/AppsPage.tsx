import { ArrowLeft, KeyRound, Plus, RotateCw, Save, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreateProxyAppRequest, ProxyApp, ProxyAppScope } from "@schemabridge/shared-types";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";

export function AppsPage() {
  const { apps, selectedAppId } = useAppStore();
  if (selectedAppId) {
    const app = apps.find((item) => item.id === selectedAppId);
    if (app) return <AppDetail app={app} />;
  }
  return <AppList />;
}

function AppList() {
  const { apps, bindings, selectApp } = useAppStore();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) => app.name.toLowerCase().includes(q) || (app.description?.toLowerCase().includes(q) ?? false));
  }, [apps, query]);

  if (creating) return <NewApp onCancel={() => setCreating(false)} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search apps…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Register app</Button>
      </div>

      {filtered.length === 0 ? (
        apps.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No apps registered"
            description="Register a service to give it an API key. Without keys, anyone reaching the proxy port can send traffic — set PROXY_REQUIRE_AUTH=true in production."
            action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Register app</Button>}
          />
        ) : (
          <p className="px-1 py-6 text-sm text-slate-500">No apps match "{query}".</p>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.4fr_120px_1fr_140px_90px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Name</span>
            <span>Prefix</span>
            <span>Scope</span>
            <span>Last used</span>
            <span>Status</span>
          </div>
          {filtered.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => selectApp(app.id)}
              className="grid w-full grid-cols-[1.4fr_120px_1fr_140px_90px] items-center gap-3 border-b border-border px-5 py-3 text-left text-sm last:border-b-0 hover:bg-muted/30"
            >
              <span>
                <div className="font-medium">{app.name}</div>
                {app.description && <div className="truncate text-xs text-slate-500">{app.description}</div>}
              </span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-slate-700">{app.keyPrefix}…</code>
              <span className="truncate text-xs text-slate-500">
                {app.scope === "all" ? "All bindings" : `${app.bindingIds.length} of ${bindings.length} bindings`}
              </span>
              <span className="text-xs text-slate-500">{app.lastUsedAt ? new Date(app.lastUsedAt).toLocaleString() : "—"}</span>
              <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", app.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                {app.enabled ? "Enabled" : "Disabled"}
              </span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

function NewApp({ onCancel }: { readonly onCancel: () => void }) {
  const { bindings, addApp, selectApp } = useAppStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<ProxyAppScope>("all");
  const [selectedBindings, setSelectedBindings] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  function toggleBinding(id: string) {
    setSelectedBindings((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function save() {
    setError(undefined);
    if (name.trim().length === 0) {
      setError("Give the app a name.");
      return;
    }
    if (scope === "selected" && selectedBindings.length === 0) {
      setError("Pick at least one binding or switch to All bindings.");
      return;
    }
    setSaving(true);
    try {
      const payload: CreateProxyAppRequest = { name: name.trim(), description: description.trim() || undefined, scope, bindingIds: scope === "selected" ? [...selectedBindings] : [] };
      const created = await addApp(payload);
      onCancel();
      selectApp(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register app.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to apps
      </button>
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">Register app</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Name"><Input value={name} placeholder="frontend-service" onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Description (optional)"><Input value={description} placeholder="Team / purpose" onChange={(event) => setDescription(event.target.value)} /></Field>
          <Field label="Scope">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value as ProxyAppScope)}>
              <option value="all">All bindings</option>
              <option value="selected">Selected bindings</option>
            </select>
          </Field>
        </div>
        {scope === "selected" && (
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium text-slate-600">Pick bindings this key can use</span>
            {bindings.length === 0 ? (
              <p className="text-xs text-slate-500">No bindings exist yet — register the app with scope "all" and tighten it later.</p>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {bindings.map((binding) => (
                  <label key={binding.id} className="flex items-start gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedBindings.includes(binding.id)}
                      onChange={() => toggleBinding(binding.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{binding.name}</span>
                      <span className="block font-mono text-[11px] text-slate-500">{binding.method} {binding.pathPattern}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "Creating…" : "Create and reveal key"}</Button>
        </div>
      </Card>
    </div>
  );
}

function AppDetail({ app }: { readonly app: ProxyApp }) {
  const { bindings, selectApp, editApp, rotateAppKey, removeApp } = useAppStore();
  const [draft, setDraft] = useState({ name: app.name, description: app.description ?? "", scope: app.scope, bindingIds: app.bindingIds, enabled: app.enabled });
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  function toggleBinding(id: string) {
    setDraft({
      ...draft,
      bindingIds: draft.bindingIds.includes(id) ? draft.bindingIds.filter((value) => value !== id) : [...draft.bindingIds, id]
    });
  }

  async function save() {
    setSaving(true);
    try {
      await editApp(app.id, {
        name: draft.name,
        description: draft.description.trim() || undefined,
        scope: draft.scope,
        bindingIds: draft.scope === "selected" ? draft.bindingIds : [],
        enabled: draft.enabled
      });
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    if (!window.confirm("Rotate this key? The current key stops working immediately.")) return;
    setRotating(true);
    try {
      await rotateAppKey(app.id);
    } finally {
      setRotating(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete app "${app.name}"? This cannot be undone.`)) return;
    await removeApp(app.id);
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => selectApp(undefined)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to apps
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{app.name}</h2>
          <p className="font-mono text-xs text-slate-500"><KeyRound className="mr-1 inline h-3 w-3" />{app.keyPrefix}… · last used {app.lastUsedAt ? new Date(app.lastUsedAt).toLocaleString() : "never"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void rotate()} disabled={rotating}>
            <RotateCw className="h-3.5 w-3.5" /> {rotating ? "Rotating…" : "Rotate key"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Settings</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Name"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Description"><Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
          <Field label="Scope">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as ProxyAppScope })}>
              <option value="all">All bindings</option>
              <option value="selected">Selected bindings</option>
            </select>
          </Field>
          <Field label="Status">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 text-sm">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              <span className={draft.enabled ? "text-emerald-700" : "text-slate-500"}>{draft.enabled ? "Enabled" : "Disabled"}</span>
            </label>
          </Field>
        </div>
        {draft.scope === "selected" && (
          <div className="mt-4">
            <span className="mb-2 block text-xs font-medium text-slate-600">Allowed bindings</span>
            {bindings.length === 0 ? (
              <p className="text-xs text-slate-500">No bindings exist yet.</p>
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {bindings.map((binding) => (
                  <label key={binding.id} className="flex items-start gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={draft.bindingIds.includes(binding.id)}
                      onChange={() => toggleBinding(binding.id)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{binding.name}</span>
                      <span className="block font-mono text-[11px] text-slate-500">{binding.method} {binding.pathPattern}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
