import { ArrowLeft, Copy, PlayCircle, Plug, Plus, Radio, Save, Search, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateProxyBindingRequest, ProxyBinding, ProxyBindingMethod, ProxyRequestLog } from "@schemabridge/shared-types";
import { listProxyRequests, PROXY_URL, probeProxy, type ProxyProbeResult } from "../lib/api";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { JsonEditor } from "../components/JsonEditor";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";

const METHODS: readonly ProxyBindingMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "*"];

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-sky-50 text-sky-700",
  POST: "bg-emerald-50 text-emerald-700",
  PUT: "bg-amber-50 text-amber-700",
  PATCH: "bg-violet-50 text-violet-700",
  DELETE: "bg-rose-50 text-rose-700",
  "*": "bg-slate-100 text-slate-700"
};

export function BindingsPage() {
  const { bindings, selectedBindingId } = useAppStore();
  if (selectedBindingId) {
    const binding = bindings.find((item) => item.id === selectedBindingId);
    if (binding) return <BindingDetail binding={binding} />;
  }
  return <BindingList />;
}

function BindingList() {
  const { bindings, mappings, selectBinding, editBinding, removeBinding, openQuickStart } = useAppStore();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bindings;
    return bindings.filter((binding) => `${binding.method} ${binding.pathPattern} ${binding.upstreamBaseUrl} ${binding.name}`.toLowerCase().includes(q));
  }, [bindings, query]);

  if (creating) return <NewBinding onCancel={() => setCreating(false)} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search bindings…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)} disabled={mappings.length === 0}>
          <Plus className="h-4 w-4" /> New binding
        </Button>
      </div>

      {filtered.length === 0 ? (
        bindings.length === 0 ? (
          <EmptyState
            icon={Plug}
            title="No bindings yet"
            description={mappings.length === 0 ? "You need at least one mapping before you can wire up a route. Quick start creates one end-to-end." : "Wire a route on :8080 to an upstream and tell the bridge which mapping to apply."}
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={openQuickStart}><PlayCircle className="h-4 w-4" /> Quick start</Button>
                {mappings.length > 0 && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New binding</Button>}
              </div>
            }
          />
        ) : (
          <p className="px-1 py-6 text-sm text-slate-500">No bindings match "{query}".</p>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[70px_1fr_1.4fr_1.2fr_90px_50px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Method</span>
            <span>Path</span>
            <span>Upstream</span>
            <span>Mapping</span>
            <span>Status</span>
            <span></span>
          </div>
          {filtered.map((binding) => (
            <div key={binding.id} className="grid grid-cols-[70px_1fr_1.4fr_1.2fr_90px_50px] items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-b-0 hover:bg-muted/30">
              <button type="button" onClick={() => selectBinding(binding.id)} className="text-left">
                <span className={cn("inline-flex h-6 w-fit items-center justify-center rounded px-2 font-mono text-[11px] font-semibold", METHOD_COLOR[binding.method] ?? "bg-slate-100 text-slate-700")}>{binding.method}</span>
              </button>
              <button type="button" onClick={() => selectBinding(binding.id)} className="truncate text-left font-mono text-xs">{binding.pathPattern}</button>
              <button type="button" onClick={() => selectBinding(binding.id)} className="truncate text-left font-mono text-xs text-slate-500">{binding.upstreamBaseUrl}</button>
              <button type="button" onClick={() => selectBinding(binding.id)} className="truncate text-left text-xs">{mappings.find((mapping) => mapping.id === binding.mappingId)?.name ?? binding.mappingId}</button>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" checked={binding.enabled} onChange={(event) => void editBinding(binding.id, { enabled: event.target.checked })} />
                <span className={binding.enabled ? "text-emerald-700" : "text-slate-500"}>{binding.enabled ? "Live" : "Paused"}</span>
              </label>
              <Button variant="ghost" size="sm" onClick={() => void removeBinding(binding.id)} aria-label="Delete binding"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function NewBinding({ onCancel }: { readonly onCancel: () => void }) {
  const { mappings, addBinding, selectBinding, bindings } = useAppStore();
  const [name, setName] = useState("");
  const [method, setMethod] = useState<ProxyBindingMethod>("POST");
  const [pathPattern, setPathPattern] = useState("/customers");
  const [upstreamBaseUrl, setUpstreamBaseUrl] = useState("http://service-b:8082");
  const [mappingId, setMappingId] = useState<string>(mappings[0]?.id ?? "");
  const [responseMappingId, setResponseMappingId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const canSave = name.length > 0 && pathPattern.length > 0 && upstreamBaseUrl.length > 0 && mappingId.length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(undefined);
    try {
      const before = new Set(bindings.map((b) => b.id));
      const payload: CreateProxyBindingRequest = {
        name, method, pathPattern, upstreamBaseUrl, mappingId,
        responseMappingId: responseMappingId || null
      };
      await addBinding(payload);
      const created = useAppStore.getState().bindings.find((b) => !before.has(b.id));
      onCancel();
      if (created) selectBinding(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save binding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to bindings
      </button>
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">New binding</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Name"><Input value={name} placeholder="POST /customers → service-b" onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Method">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={method} onChange={(event) => setMethod(event.target.value as ProxyBindingMethod)}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Path pattern"><Input value={pathPattern} placeholder="/customers/:id" onChange={(event) => setPathPattern(event.target.value)} /></Field>
          <Field label="Upstream base URL"><Input value={upstreamBaseUrl} placeholder="http://service-b:8082" onChange={(event) => setUpstreamBaseUrl(event.target.value)} /></Field>
          <Field label="Request mapping">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={mappingId} onChange={(event) => setMappingId(event.target.value)}>
              <option value="">Choose a mapping…</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Response mapping (optional)">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={responseMappingId} onChange={(event) => setResponseMappingId(event.target.value)}>
              <option value="">No response mapping</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave || saving}>{saving ? "Saving…" : "Create binding"}</Button>
        </div>
      </Card>
    </div>
  );
}

function BindingDetail({ binding }: { readonly binding: ProxyBinding }) {
  const { mappings, selectBinding, editBinding, removeBinding } = useAppStore();
  const [draft, setDraft] = useState({
    name: binding.name,
    method: binding.method,
    pathPattern: binding.pathPattern,
    upstreamBaseUrl: binding.upstreamBaseUrl,
    mappingId: binding.mappingId,
    responseMappingId: binding.responseMappingId ?? "",
    enabled: binding.enabled
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await editBinding(binding.id, {
        name: draft.name,
        method: draft.method,
        pathPattern: draft.pathPattern,
        upstreamBaseUrl: draft.upstreamBaseUrl,
        mappingId: draft.mappingId,
        responseMappingId: draft.responseMappingId || null,
        enabled: draft.enabled
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => selectBinding(undefined)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to bindings
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{binding.name}</h2>
          <p className="font-mono text-xs text-slate-500">{binding.method} {binding.pathPattern} → {binding.upstreamBaseUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
            <span className={draft.enabled ? "text-emerald-700" : "text-slate-500"}>{draft.enabled ? "Live" : "Paused"}</span>
          </label>
          <Button variant="danger" size="sm" onClick={async () => { await removeBinding(binding.id); selectBinding(undefined); }}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Settings</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Name"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
          <Field label="Method">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as ProxyBindingMethod })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Path pattern"><Input value={draft.pathPattern} onChange={(event) => setDraft({ ...draft, pathPattern: event.target.value })} /></Field>
          <Field label="Upstream base URL"><Input value={draft.upstreamBaseUrl} onChange={(event) => setDraft({ ...draft, upstreamBaseUrl: event.target.value })} /></Field>
          <Field label="Request mapping">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.mappingId} onChange={(event) => setDraft({ ...draft, mappingId: event.target.value })}>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Response mapping (optional)">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.responseMappingId} onChange={(event) => setDraft({ ...draft, responseMappingId: event.target.value })}>
              <option value="">No response mapping</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </Card>

      <Tabs defaultValue="try">
        <TabsList>
          <TabsTrigger value="try"><Send className="h-3.5 w-3.5" /> Try it</TabsTrigger>
          <TabsTrigger value="traffic"><Radio className="h-3.5 w-3.5" /> Recent traffic</TabsTrigger>
        </TabsList>
        <TabsContent value="try" className="mt-4"><TryPanel binding={binding} /></TabsContent>
        <TabsContent value="traffic" className="mt-4"><RecentTraffic bindingId={binding.id} /></TabsContent>
      </Tabs>
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

function TryPanel({ binding }: { readonly binding: ProxyBinding }) {
  const [payload, setPayload] = useState("{\n  \"customerName\": \"Ada\",\n  \"customerEmail\": \"ada@example.com\"\n}");
  const [result, setResult] = useState<ProxyProbeResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const curlCommand = useMemo(() => {
    const method = binding.method === "*" ? "POST" : binding.method;
    const path = binding.pathPattern.replace(/:([A-Za-z0-9_]+)/g, "demo");
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
    const lines = [`curl -X ${method} ${PROXY_URL}${path}`, `  -H 'content-type: application/json'`];
    if (hasBody) lines.push(`  -d '${payload.replace(/\n\s*/g, " ")}'`);
    return lines.join(" \\\n");
  }, [binding, payload]);

  async function run() {
    setRunning(true);
    setError(undefined);
    try {
      const body = JSON.parse(payload) as unknown;
      const probe = await probeProxy(binding, body);
      setResult(probe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function copyCurl() {
    await navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Request</h3>
        <div className="space-y-3">
          <JsonEditor value={payload} onChange={setPayload} label="Request body" minHeight="180px" maxHeight="280px" />
          <Button onClick={() => void run()} disabled={running}>
            <Send className="h-4 w-4" /> {running ? "Sending…" : "Send through proxy"}
          </Button>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Equivalent curl</span>
            <Button variant="ghost" size="sm" onClick={() => void copyCurl()}><Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}</Button>
          </div>
          <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{curlCommand}</pre>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Response</h3>
          {result && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${result.status >= 200 && result.status < 300 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              HTTP {result.status}
            </span>
          )}
        </div>
        {result ? (
          <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(result.body, null, 2)}</pre>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Send a request to see the upstream response.</div>
        )}
      </Card>
    </div>
  );
}

function RecentTraffic({ bindingId }: { readonly bindingId: string }) {
  const [logs, setLogs] = useState<readonly ProxyRequestLog[]>([]);
  const refresh = useCallback(async () => {
    const all = await listProxyRequests({ limit: 100 });
    setLogs(all.filter((log) => log.bindingId === bindingId));
  }, [bindingId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  if (logs.length === 0) {
    return (
      <Card className="p-5 text-center text-sm text-slate-500">
        No recent traffic for this binding. Send a request from <em>Try it</em>.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[140px_1fr_100px_100px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>Time</span>
        <span>Path</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      {logs.map((log) => (
        <div key={log.id} className="grid grid-cols-[140px_1fr_100px_100px] items-center gap-3 border-b border-border px-5 py-2.5 text-sm last:border-b-0">
          <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
          <span className="truncate font-mono text-xs">{log.path}</span>
          <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", log.statusCode < 300 ? "bg-emerald-50 text-emerald-700" : log.statusCode < 500 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>{log.statusCode}</span>
          <span className="text-xs text-slate-500">{log.durationMs}ms</span>
        </div>
      ))}
    </Card>
  );
}
