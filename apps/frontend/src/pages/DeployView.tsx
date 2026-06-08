import { GitBranch, Plug, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreateProxyBindingRequest, MappingDocument, ProxyBindingMethod } from "@schemabridge/shared-types";
import { useAppStore } from "../store";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";

const METHODS: readonly ProxyBindingMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "*"];

const METHOD_COLOR: Record<ProxyBindingMethod, string> = {
  GET: "bg-sky-50 text-sky-700",
  POST: "bg-emerald-50 text-emerald-700",
  PUT: "bg-amber-50 text-amber-700",
  PATCH: "bg-violet-50 text-violet-700",
  DELETE: "bg-rose-50 text-rose-700",
  "*": "bg-slate-100 text-slate-700"
};

export function DeployView() {
  const { bindings, mappings, addBinding, editBinding, removeBinding, setView } = useAppStore();
  const [showForm, setShowForm] = useState(bindings.length === 0);

  if (mappings.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="You need a mapping first"
        description="Bindings tell the proxy which mapping to apply on which route. Create a mapping in the Design view, then come back here."
        action={<Button onClick={() => setView("design")}>Go to Design</Button>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-600">Each binding turns a route on <code className="rounded bg-muted px-1 py-0.5 text-xs">:8080</code> into live middleware.</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New binding</Button>
        )}
      </div>

      {showForm && <BindingForm onCancel={() => setShowForm(false)} onCreate={addBinding} mappings={mappings} />}

      {bindings.length === 0 ? (
        !showForm && (
          <EmptyState
            icon={Plug}
            title="No bindings yet"
            description="Wire up your first route. Bindings match a path + method, transform the payload with a mapping, and forward to an upstream service."
            action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Create binding</Button>}
          />
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[80px_1.4fr_1.6fr_1.4fr_120px_80px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Method</span>
            <span>Path</span>
            <span>Upstream</span>
            <span>Mapping</span>
            <span>Status</span>
            <span></span>
          </div>
          {bindings.map((binding) => (
            <div key={binding.id} className="grid grid-cols-[80px_1.4fr_1.6fr_1.4fr_120px_80px] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
              <span className={cn("inline-flex h-6 w-fit items-center justify-center rounded px-2 font-mono text-[11px] font-semibold", METHOD_COLOR[binding.method])}>{binding.method}</span>
              <span className="truncate font-mono text-xs">{binding.pathPattern}</span>
              <span className="truncate font-mono text-xs text-slate-500">{binding.upstreamBaseUrl}</span>
              <span className="truncate text-xs">{mappings.find((mapping) => mapping.id === binding.mappingId)?.name ?? binding.mappingId}</span>
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

interface FormProps {
  readonly mappings: readonly MappingDocument[];
  readonly onCreate: (input: CreateProxyBindingRequest) => Promise<void>;
  readonly onCancel: () => void;
}

function BindingForm({ mappings, onCreate, onCancel }: FormProps) {
  const [name, setName] = useState("");
  const [method, setMethod] = useState<ProxyBindingMethod>("POST");
  const [pathPattern, setPathPattern] = useState("/customers");
  const [upstreamBaseUrl, setUpstreamBaseUrl] = useState("http://service-b:8082");
  const [mappingId, setMappingId] = useState<string>(mappings[0]?.id ?? "");
  const [responseMappingId, setResponseMappingId] = useState<string>("");
  const canCreate = name.length > 0 && pathPattern.length > 0 && upstreamBaseUrl.length > 0 && mappingId.length > 0;

  async function submit() {
    if (!canCreate) return;
    await onCreate({ name, method, pathPattern, upstreamBaseUrl, mappingId, responseMappingId: responseMappingId || null });
    onCancel();
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">New binding</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
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
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void submit()} disabled={!canCreate}><Plus className="h-4 w-4" /> Create binding</Button>
      </div>
    </Card>
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
