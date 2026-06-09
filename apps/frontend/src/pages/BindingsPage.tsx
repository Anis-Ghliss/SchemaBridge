import { ArrowLeft, Copy, KeyRound, PlayCircle, Plug, Plus, Radio, Save, Search, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateProxyBindingRequest, JsonValue, MappingDocument, MappingRule, ProxyBinding, ProxyBindingMethod, ProxyBindingValidationMode, ProxyRequestLog } from "@schemabridge/shared-types";
import { transformPayload, validateAgainstExample } from "@schemabridge/transformation-engine";
import { API_URL, listProxyRequests, PROXY_URL, probeBinding, probeProxy, type ProxyProbeResult } from "../lib/api";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { JsonEditor } from "../components/JsonEditor";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";
import { useUnsavedChange } from "../lib/useUnsavedChange";

const METHODS: readonly ProxyBindingMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "*"];
const VALIDATION_MODES: readonly ProxyBindingValidationMode[] = ["off", "warn", "strict"];

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
  const { bindings, mappings, selectBinding, editBinding, removeBinding, openQuickStart, confirmDialog } = useAppStore();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bindings;
    return bindings.filter((binding) => `${binding.method} ${binding.pathPattern} ${binding.upstreamBaseUrl} ${binding.name}`.toLowerCase().includes(q));
  }, [bindings, query]);

  if (creating) return <NewBinding onCancel={() => setCreating(false)} />;

  async function confirmRemove(binding: ProxyBinding) {
    if (!(await confirmDialog({
      title: `Delete binding "${binding.name}"?`,
      description: "This removes the proxy route. Senders using this path will no longer match it.",
      confirmLabel: "Delete binding",
      variant: "danger"
    }))) return;
    await removeBinding(binding.id);
  }

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
              <Button variant="ghost" size="sm" onClick={() => void confirmRemove(binding)} aria-label="Delete binding"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function NewBinding({ onCancel }: { readonly onCancel: () => void }) {
  useUnsavedChange("new-binding", true);
  const { mappings, addBinding, selectBinding, bindings, confirmUnsavedChange } = useAppStore();
  const [draft, setDraft] = useState({
    name: "",
    method: "POST" as ProxyBindingMethod,
    pathPattern: "/customers",
    upstreamBaseUrl: "http://service-b:8082",
    mappingId: mappings[0]?.id ?? "",
    responseMappingId: "",
    validationMode: "off" as ProxyBindingValidationMode
  });
  const [status, setStatus] = useState<{ readonly saving: boolean; readonly error?: string }>({ saving: false });
  const cancel = async () => {
    if (await confirmUnsavedChange()) onCancel();
  };

  const canSave = draft.name.length > 0 && draft.pathPattern.length > 0 && draft.upstreamBaseUrl.length > 0 && draft.mappingId.length > 0;

  async function save() {
    if (!canSave) return;
    setStatus({ saving: true });
    try {
      const before = new Set(bindings.map((b) => b.id));
      const payload: CreateProxyBindingRequest = {
        name: draft.name,
        method: draft.method,
        pathPattern: draft.pathPattern,
        upstreamBaseUrl: draft.upstreamBaseUrl,
        mappingId: draft.mappingId,
        responseMappingId: draft.responseMappingId || null,
        validationMode: draft.validationMode
      };
      await addBinding(payload);
      const created = useAppStore.getState().bindings.find((b) => !before.has(b.id));
      onCancel();
      if (created) selectBinding(created.id);
    } catch (err) {
      setStatus({ saving: false, error: err instanceof Error ? err.message : "Failed to save binding." });
      return;
    } finally {
      setStatus((current) => ({ ...current, saving: false }));
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => void cancel()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Back to bindings
      </button>
      <Card className="p-5">
        <h2 className="text-sm font-semibold">New binding</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">Define the proxy route SchemaBridge listens on, the mapping it applies, and the service it forwards to.</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Binding name" description="Internal display name for this route.">
            <Input value={draft.name} placeholder="Orders route to receiver" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="Incoming request method" description="HTTP method SchemaBridge should match.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as ProxyBindingMethod })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Incoming request path" description="Path your sender calls on the SchemaBridge proxy port.">
            <Input value={draft.pathPattern} placeholder="/orders" onChange={(event) => setDraft({ ...draft, pathPattern: event.target.value })} />
          </Field>
          <Field label="Forward to service URL" description="Destination service that receives the transformed request.">
            <Input value={draft.upstreamBaseUrl} placeholder="http://receiver:8090" onChange={(event) => setDraft({ ...draft, upstreamBaseUrl: event.target.value })} />
          </Field>
          <Field label="Request body mapping" description="Transforms the incoming request before forwarding it.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.mappingId} onChange={(event) => setDraft({ ...draft, mappingId: event.target.value })}>
              <option value="">Choose a mapping…</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Response body mapping (optional)" description="Transforms the upstream response before returning it to the sender.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.responseMappingId} onChange={(event) => setDraft({ ...draft, responseMappingId: event.target.value })}>
              <option value="">No response mapping</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Payload validation" description="Controls whether SchemaBridge checks payloads against the source and target schemas.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.validationMode} onChange={(event) => setDraft({ ...draft, validationMode: event.target.value as ProxyBindingValidationMode })}>
              {VALIDATION_MODES.map((mode) => <option key={mode} value={mode}>{labelValidationMode(mode)}</option>)}
            </select>
          </Field>
        </div>
        {status.error && <p className="mt-3 text-xs text-rose-600">{status.error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void cancel()}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!canSave || status.saving}>{status.saving ? "Saving…" : "Create binding"}</Button>
        </div>
      </Card>
    </div>
  );
}

function BindingDetail({ binding }: { readonly binding: ProxyBinding }) {
  const { mappings, selectBinding, editBinding, removeBinding, confirmUnsavedChange, confirmDialog } = useAppStore();
  const [draft, setDraft] = useState({
    name: binding.name,
    method: binding.method,
    pathPattern: binding.pathPattern,
    upstreamBaseUrl: binding.upstreamBaseUrl,
    mappingId: binding.mappingId,
    responseMappingId: binding.responseMappingId ?? "",
    validationMode: binding.validationMode,
    enabled: binding.enabled
  });
  const [saving, setSaving] = useState(false);
  const dirty = draft.name !== binding.name
    || draft.method !== binding.method
    || draft.pathPattern !== binding.pathPattern
    || draft.upstreamBaseUrl !== binding.upstreamBaseUrl
    || draft.mappingId !== binding.mappingId
    || draft.responseMappingId !== (binding.responseMappingId ?? "")
    || draft.validationMode !== binding.validationMode
    || draft.enabled !== binding.enabled;
  useUnsavedChange(`binding-edit-${binding.id}`, dirty);
  const backToList = async () => {
    if (await confirmUnsavedChange()) selectBinding(undefined);
  };

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
        validationMode: draft.validationMode,
        enabled: draft.enabled
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog({
      title: `Delete binding "${binding.name}"?`,
      description: "This removes the proxy route. Senders using this path will no longer match it.",
      confirmLabel: "Delete binding",
      variant: "danger"
    }))) return;
    await removeBinding(binding.id);
    selectBinding(undefined);
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => void backToList()} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-foreground">
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
          <Button variant="danger" size="sm" onClick={() => void remove()}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Settings</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Binding name" description="Internal display name for this route.">
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="Incoming request method" description="HTTP method SchemaBridge should match.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as ProxyBindingMethod })}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Incoming request path" description="Path your sender calls on the SchemaBridge proxy port.">
            <Input value={draft.pathPattern} onChange={(event) => setDraft({ ...draft, pathPattern: event.target.value })} />
          </Field>
          <Field label="Forward to service URL" description="Destination service that receives the transformed request.">
            <Input value={draft.upstreamBaseUrl} onChange={(event) => setDraft({ ...draft, upstreamBaseUrl: event.target.value })} />
          </Field>
          <Field label="Request body mapping" description="Transforms the incoming request before forwarding it.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.mappingId} onChange={(event) => setDraft({ ...draft, mappingId: event.target.value })}>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Response body mapping (optional)" description="Transforms the upstream response before returning it to the sender.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.responseMappingId} onChange={(event) => setDraft({ ...draft, responseMappingId: event.target.value })}>
              <option value="">No response mapping</option>
              {mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.name}</option>)}
            </select>
          </Field>
          <Field label="Payload validation" description="Controls whether SchemaBridge checks payloads against the source and target schemas.">
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.validationMode} onChange={(event) => setDraft({ ...draft, validationMode: event.target.value as ProxyBindingValidationMode })}>
              {VALIDATION_MODES.map((mode) => <option key={mode} value={mode}>{labelValidationMode(mode)}</option>)}
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
        <TabsContent value="try" className="mt-4"><TryPanel key={`${binding.id}:${binding.mappingId}`} binding={binding} /></TabsContent>
        <TabsContent value="traffic" className="mt-4"><RecentTraffic bindingId={binding.id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, description, children }: { readonly label: string; readonly description?: string; readonly children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
      {description && <span className="text-[11px] leading-4 text-slate-500">{description}</span>}
    </label>
  );
}

function labelValidationMode(mode: ProxyBindingValidationMode): string {
  if (mode === "strict") return "Strict - reject invalid payloads";
  if (mode === "warn") return "Warn - log validation errors";
  return "Off";
}

const TRY_API_KEY_STORAGE = "schemabridge:try-api-key";
const TRY_APP_ID_STORAGE = "schemabridge:try-app-id";

function getInitialTryAppId(revealedAppId?: string): string {
  if (revealedAppId) return revealedAppId;
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TRY_APP_ID_STORAGE) ?? "";
}

function getInitialTryApiKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TRY_API_KEY_STORAGE) ?? "";
}

function createFallbackPayload(mappingName?: string): JsonValue {
  return { example: mappingName ? `Example payload for ${mappingName}` : "Example payload" };
}

function getProxyAuthHint(status?: number, body?: unknown): string | undefined {
  const error = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : undefined;
  if (status === 401) return "The proxy requires an API key. Paste a full sb_ key, use the latest revealed key, or rotate an app key to reveal a new one.";
  if (status === 403 && error === "api key not authorized for this binding") return "This key is valid, but its app is not allowed to use this binding. Open Apps and either include this binding in the app's selected scope or use an app key with access to all bindings.";
  if (status === 403 && error === "app is disabled") return "This key belongs to a disabled app. Enable the app or use another app key.";
  return undefined;
}

function buildProbeCurlBody(appId: string, payload: string): string {
  try {
    return JSON.stringify({ appId, input: JSON.parse(payload) }).replace(/\n\s*/g, " ");
  } catch {
    return JSON.stringify({ appId, input: "Fix request body JSON first" });
  }
}

function currentMappingRules(mapping?: MappingDocument): readonly MappingRule[] {
  return mapping?.versions.find((version) => version.version === mapping.currentVersion)?.rules ?? [];
}

function TryPanel({ binding }: { readonly binding: ProxyBinding }) {
  const revealedKey = useAppStore((store) => store.revealedKey);
  const apps = useAppStore((store) => store.apps);
  const mappings = useAppStore((store) => store.mappings);
  const schemas = useAppStore((store) => store.schemas);
  const requestMapping = mappings.find((mapping) => mapping.id === binding.mappingId);
  const sourceSchema = requestMapping ? schemas.find((schema) => schema.id === requestMapping.sourceSchemaId) : undefined;
  const targetSchema = requestMapping ? schemas.find((schema) => schema.id === requestMapping.targetSchemaId) : undefined;
  const samplePayload = useMemo(() => JSON.stringify(sourceSchema?.content ?? createFallbackPayload(requestMapping?.name), null, 2), [requestMapping?.name, sourceSchema?.content]);
  const rules = useMemo(() => currentMappingRules(requestMapping), [requestMapping]);
  const [state, setState] = useState<{
    readonly payload: string;
    readonly appId: string;
    readonly apiKey: string;
    readonly result: ProxyProbeResult | null;
    readonly error?: string;
    readonly running: boolean;
    readonly copied: boolean;
  }>(() => ({
    payload: samplePayload,
    appId: getInitialTryAppId(revealedKey?.id),
    apiKey: getInitialTryApiKey(),
    result: null,
    running: false,
    copied: false
  }));
  const selectedApp = apps.find((app) => app.id === state.appId);
  const selectedAppBlocked = selectedApp?.scope === "selected" && !selectedApp.bindingIds.includes(binding.id);
  const selectedAppDisabled = selectedApp?.enabled === false;
  const canUseRevealedKey = Boolean(revealedKey && (!state.appId || state.appId === revealedKey.id));
  const authHint = getProxyAuthHint(state.result?.status, state.result?.body);
  const transformPreview = useMemo(() => {
    try {
      const input = JSON.parse(state.payload) as JsonValue;
      const result = transformPayload(input, rules, { includeMissingErrors: true });
      return {
        status: result.status,
        output: result.output ?? {},
        errors: result.errors
      };
    } catch (err) {
      return {
        status: "error" as const,
        output: null,
        errors: [err instanceof Error ? err.message : "Request body is not valid JSON."]
      };
    }
  }, [rules, state.payload]);
  const validationPreview = useMemo(() => {
    if (binding.validationMode === "off") {
      return { sourceErrors: [] as readonly string[], targetErrors: [] as readonly string[] };
    }
    try {
      const input = JSON.parse(state.payload) as JsonValue;
      const sourceErrors = sourceSchema ? validateAgainstExample(input, sourceSchema.content, "request-source") : [];
      const targetErrors = targetSchema && transformPreview.status === "success" ? validateAgainstExample(transformPreview.output as JsonValue, targetSchema.content, "request-target") : [];
      return { sourceErrors, targetErrors };
    } catch (err) {
      return { sourceErrors: [err instanceof Error ? err.message : "Request body is not valid JSON."], targetErrors: [] as readonly string[] };
    }
  }, [binding.validationMode, sourceSchema, state.payload, targetSchema, transformPreview.output, transformPreview.status]);
  const validationErrors = [...validationPreview.sourceErrors, ...validationPreview.targetErrors];
  const previewIsReady = transformPreview.status === "success" && (binding.validationMode === "off" || validationErrors.length === 0);

  const curlCommand = useMemo(() => {
    const method = binding.method === "*" ? "POST" : binding.method;
    const path = binding.pathPattern.replace(/:([A-Za-z0-9_]+)/g, "demo");
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
    if (state.appId) {
      return [
        `curl -X POST ${API_URL}/bindings/${binding.id}/probe`,
        `  -H 'content-type: application/json'`,
        `  -H 'Authorization: Bearer $SCHEMABRIDGE_ADMIN_TOKEN'`,
        `  -d '${buildProbeCurlBody(state.appId, state.payload)}'`
      ].join(" \\\n");
    }
    const lines = [`curl -X ${method} ${PROXY_URL}${path}`, `  -H 'content-type: application/json'`];
    if (state.apiKey) lines.push(`  -H 'Authorization: Bearer ${state.apiKey}'`);
    if (hasBody) lines.push(`  -d '${state.payload.replace(/\n\s*/g, " ")}'`);
    return lines.join(" \\\n");
  }, [binding, state.payload, state.apiKey, state.appId]);

  async function run() {
    setState((current) => ({ ...current, running: true, error: undefined }));
    try {
      const body = JSON.parse(state.payload) as unknown;
      let probe: ProxyProbeResult;
      if (state.appId) {
        if (typeof window !== "undefined") window.localStorage.setItem(TRY_APP_ID_STORAGE, state.appId);
        probe = await probeBinding(binding.id, body, { appId: state.appId });
      } else {
        const trimmed = state.apiKey.trim();
        if (typeof window !== "undefined") {
          if (trimmed) window.localStorage.setItem(TRY_API_KEY_STORAGE, trimmed);
          else window.localStorage.removeItem(TRY_API_KEY_STORAGE);
        }
        probe = await probeProxy(binding, body, trimmed ? { apiKey: trimmed } : {});
      }
      setState((current) => ({ ...current, result: probe, running: false }));
    } catch (err) {
      setState((current) => ({ ...current, error: err instanceof Error ? err.message : "unknown error", result: null, running: false }));
    }
  }

  async function copyCurl() {
    await navigator.clipboard.writeText(curlCommand);
    setState((current) => ({ ...current, copied: true }));
    window.setTimeout(() => setState((current) => ({ ...current, copied: false })), 1500);
  }

  function useRevealedKey() {
    if (!revealedKey) return;
    if (typeof window !== "undefined") window.localStorage.setItem(TRY_API_KEY_STORAGE, revealedKey.key);
    setState((current) => ({ ...current, apiKey: revealedKey.key, result: null, error: undefined }));
  }

  function useSourceExample() {
    setState((current) => ({ ...current, payload: samplePayload, result: null, error: undefined }));
  }

  function selectSendAs(appId: string) {
    setState((current) => ({ ...current, appId, result: null, error: undefined }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Request</h3>
        <div className="space-y-3">
          <div className="flex flex-col gap-1.5 text-xs">
            <label className="font-medium text-slate-600" htmlFor="try-send-as">Send as</label>
            <select id="try-send-as" className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={state.appId} onChange={(event) => selectSendAs(event.target.value)}>
              <option value="">Manual API key</option>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}{app.enabled ? "" : " (disabled)"} - {app.scope === "all" ? "all bindings" : `${app.bindingIds.length} selected`}
                </option>
              ))}
            </select>
            {selectedApp && <span className="text-[11px] leading-4 text-slate-500">Using app {selectedApp.keyPrefix}... with {selectedApp.scope === "all" ? "access to all bindings" : "selected binding access"}.</span>}
            {selectedAppBlocked && <span className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700">This app is not allowed to use this binding. Add this binding to the app's selected scope or choose another app.</span>}
            {selectedAppDisabled && <span className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-700">This app is disabled. Enable it before sending through the proxy.</span>}
          </div>
          {selectedApp ? (
            <div className="rounded-md border border-border bg-white px-3 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block font-medium text-slate-600">Active key</span>
                  <span className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-slate-500"><KeyRound className="h-3 w-3" /> {selectedApp.keyPrefix}...</span>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Ready to send</span>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">Try it uses your admin session to send as this app. External callers still need the full API key.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="font-medium text-slate-600" htmlFor="try-api-key">Full API key</label>
                {canUseRevealedKey && (
                  <button type="button" className="text-[11px] font-medium text-foreground hover:underline" onClick={useRevealedKey}>
                    Use latest revealed key
                  </button>
                )}
              </div>
              <Input id="try-api-key" type="password" value={state.apiKey} onChange={(event) => setState({ ...state, apiKey: event.target.value })} placeholder="sb_..." />
              <span className="text-[11px] leading-4 text-slate-500">Use manual mode when you have a key from outside this app session.</span>
            </div>
          )}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">Request body</span>
              <button type="button" className="text-[11px] font-medium text-foreground hover:underline" onClick={useSourceExample}>
                Use {sourceSchema?.name ?? "mapping source"} example
              </button>
            </div>
            <JsonEditor value={state.payload} onChange={(payload) => setState({ ...state, payload, result: null, error: undefined })} label="Source body JSON" minHeight="180px" maxHeight="280px" />
          </div>
          <Button onClick={() => void run()} disabled={state.running || selectedAppDisabled || selectedAppBlocked}>
            <Send className="h-4 w-4" /> {state.running ? "Sending…" : "Send through proxy"}
          </Button>
          {state.error && <p className="text-xs text-rose-600">{state.error}</p>}
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Equivalent curl</span>
            <Button variant="ghost" size="sm" onClick={() => void copyCurl()}><Copy className="h-3 w-3" /> {state.copied ? "Copied" : "Copy"}</Button>
          </div>
          <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{curlCommand}</pre>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Transformed request</h3>
            <p className="mt-1 text-[11px] text-slate-500">{requestMapping?.name ?? "Selected mapping"} · v{requestMapping?.currentVersion ?? 1}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${previewIsReady ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {previewIsReady ? "Ready" : "Invalid"}
          </span>
        </div>
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <span className="block text-[11px] text-slate-500">Rules</span>
            <span className="font-semibold">{rules.length}</span>
          </div>
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <span className="block text-[11px] text-slate-500">Target payload</span>
            <span className="font-semibold">{transformPreview.status === "success" ? "Generated" : "Blocked"}</span>
          </div>
          <div className="rounded-md border border-border bg-white px-3 py-2">
            <span className="block text-[11px] text-slate-500">Validation</span>
            <span className="font-semibold">{binding.validationMode === "off" ? "Off" : validationErrors.length === 0 ? labelValidationMode(binding.validationMode).split(" - ")[0] : `${validationErrors.length} issue${validationErrors.length === 1 ? "" : "s"}`}</span>
          </div>
        </div>
        {transformPreview.errors.length > 0 && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            {transformPreview.errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        )}
        {validationErrors.length > 0 && (
          <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            {validationPreview.sourceErrors.map((error) => <div key={`source:${error}`}>Source: {error}</div>)}
            {validationPreview.targetErrors.map((error) => <div key={`target:${error}`}>Target: {error}</div>)}
          </div>
        )}
        <pre className="max-h-[420px] min-h-[240px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
          {JSON.stringify(transformPreview.output, null, 2)}
        </pre>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Response</h3>
          {state.result && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${state.result.status >= 200 && state.result.status < 300 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              HTTP {state.result.status}
            </span>
          )}
        </div>
        {state.result ? (
          <div className="space-y-3">
            {authHint && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">{authHint}</p>}
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(state.result.body, null, 2)}</pre>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Send a request to see the upstream response.</div>
        )}
      </Card>
    </div>
  );
}

function RecentTraffic({ bindingId }: { readonly bindingId: string }) {
  const apps = useAppStore((store) => store.apps);
  const [logs, setLogs] = useState<readonly ProxyRequestLog[]>([]);
  const [expanded, setExpanded] = useState<string>();
  const appById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
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
      <div className="grid grid-cols-[140px_1fr_1fr_100px_100px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>Time</span>
        <span>Path</span>
        <span>App</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      {logs.map((log) => {
        const app = log.appId ? appById.get(log.appId) : undefined;
        const isExpanded = expanded === log.id;
        return (
        <div key={log.id} className="border-b border-border last:border-b-0">
          <button type="button" className="grid w-full grid-cols-[140px_1fr_1fr_100px_100px] items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-muted/30" onClick={() => setExpanded(isExpanded ? undefined : log.id)}>
            <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
            <span className="truncate font-mono text-xs">{log.path}</span>
            <span className="truncate text-xs text-slate-500">{app ? `${app.name} (${app.keyPrefix}...)` : log.appId ? log.appId : "none"}</span>
            <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", log.statusCode < 300 ? "bg-emerald-50 text-emerald-700" : log.statusCode < 500 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>{log.statusCode}</span>
            <span className="text-xs text-slate-500">{log.durationMs}ms</span>
          </button>
          {isExpanded && (
            <div className="grid gap-3 border-t border-border bg-muted/30 px-5 py-4 text-xs lg:grid-cols-2">
              <TraceDetail label="Incoming request" value={log.incomingRequest} />
              <TraceDetail label="Transformed request" value={log.transformedRequest} />
              <TraceDetail label="Response body" value={log.responseBody} />
              {log.upstreamUrl && (
                <div className="lg:col-span-2">
                  <TraceLabel>Upstream URL</TraceLabel>
                  <code className="block rounded-md bg-white px-3 py-2 font-mono text-[11px] text-slate-700">{log.upstreamUrl}</code>
                </div>
              )}
              {log.errors.length > 0 && (
                <div className="lg:col-span-2">
                  <TraceLabel>Errors</TraceLabel>
                  <ul className="space-y-1">
                    {log.errors.map((message) => (
                      <li key={`${log.id}-${message}`} className="rounded-md bg-rose-50 px-3 py-2 font-mono text-[11px] text-rose-700">{message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })}
    </Card>
  );
}

function TraceDetail({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <div>
      <TraceLabel>{label}</TraceLabel>
      {value === null || value === undefined ? (
        <div className="rounded-md bg-white px-3 py-2 text-[11px] text-slate-400">—</div>
      ) : (
        <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-50">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}

function TraceLabel({ children }: { readonly children: React.ReactNode }) {
  return <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}
