import { Activity, Pause, Play, Radio } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProxyRequestLog } from "@schemabridge/shared-types";
import { listProxyRequests } from "../lib/api";
import { useAppStore } from "../store";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";

const POLL_INTERVAL_MS = 2000;
const MAX_ROWS = 100;

const METHOD_COLOR: Record<string, string> = {
  GET: "bg-sky-50 text-sky-700",
  POST: "bg-emerald-50 text-emerald-700",
  PUT: "bg-amber-50 text-amber-700",
  PATCH: "bg-violet-50 text-violet-700",
  DELETE: "bg-rose-50 text-rose-700"
};

type StatusFilter = "all" | "2xx" | "4xx" | "5xx";

export function LivePage() {
  const { bindings, setView, selectBinding } = useAppStore();
  const [logs, setLogs] = useState<readonly ProxyRequestLog[]>([]);
  const [paused, setPaused] = useState(false);
  const [bindingFilter, setBindingFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const seenIds = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const next = await listProxyRequests({ limit: MAX_ROWS });
      const merged: ProxyRequestLog[] = [];
      const seen = new Set<string>();
      for (const entry of next) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        merged.push(entry);
        if (merged.length >= MAX_ROWS) break;
      }
      seenIds.current = seen;
      setLogs(merged);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load traffic");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [paused, refresh]);

  const bindingNameById = useMemo(() => new Map(bindings.map((binding) => [binding.id, binding.name])), [bindings]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (bindingFilter && log.bindingId !== bindingFilter) return false;
      if (statusFilter === "2xx" && (log.statusCode < 200 || log.statusCode >= 300)) return false;
      if (statusFilter === "4xx" && (log.statusCode < 400 || log.statusCode >= 500)) return false;
      if (statusFilter === "5xx" && log.statusCode < 500) return false;
      return true;
    });
  }, [logs, bindingFilter, statusFilter]);

  if (bindings.length === 0 && logs.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="No traffic yet"
        description="Wire up a binding and send a request through the proxy to see live traffic here."
        action={<Button onClick={() => setView("bindings")}>Go to Bindings</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", paused ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700")}>
            <Activity className={cn("h-3 w-3", paused ? "" : "animate-pulse")} />
            {paused ? "Paused" : `Polling every ${POLL_INTERVAL_MS / 1000}s`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-md border border-border bg-white px-2 text-xs" value={bindingFilter} onChange={(event) => setBindingFilter(event.target.value)}>
            <option value="">All bindings</option>
            {bindings.map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}
          </select>
          <select className="h-8 rounded-md border border-border bg-white px-2 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">All statuses</option>
            <option value="2xx">2xx success</option>
            <option value="4xx">4xx client error</option>
            <option value="5xx">5xx server error</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => setPaused((value) => !value)}>
            {paused ? (<><Play className="h-3.5 w-3.5" /> Resume</>) : (<><Pause className="h-3.5 w-3.5" /> Pause</>)}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {logs.length === 0 ? "Waiting for traffic — send a request from a binding's Try it tab." : `No requests match the current filter.`}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[140px_70px_1fr_90px_90px_1fr] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Time</span>
            <span>Method</span>
            <span>Path</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Binding</span>
          </div>
          {filtered.map((log) => {
            const isExpanded = expanded === log.id;
            return (
              <div key={log.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  className="grid w-full grid-cols-[140px_70px_1fr_90px_90px_1fr] items-center gap-3 px-5 py-3 text-left text-sm hover:bg-muted/30"
                  onClick={() => setExpanded(isExpanded ? undefined : log.id)}
                >
                  <span className="text-xs text-slate-500">{formatTime(log.createdAt)}</span>
                  <span className={cn("inline-flex h-6 w-fit items-center justify-center rounded px-2 font-mono text-[11px] font-semibold", METHOD_COLOR[log.method] ?? "bg-slate-100 text-slate-700")}>{log.method}</span>
                  <span className="truncate font-mono text-xs">{log.path}</span>
                  <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColor(log.statusCode))}>{log.statusCode}</span>
                  <span className="text-xs text-slate-500">{log.durationMs}ms</span>
                  <span className="truncate text-xs text-slate-600">
                    {log.bindingId ? (
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-block underline-offset-2 hover:underline"
                        onClick={(event) => { event.stopPropagation(); setView("bindings"); selectBinding(log.bindingId!); }}
                      >
                        {bindingNameById.get(log.bindingId) ?? log.bindingId}
                      </span>
                    ) : (
                      <span className="text-slate-400">no match</span>
                    )}
                  </span>
                </button>
                {isExpanded && (
                  <div className="grid gap-3 border-t border-border bg-muted/30 px-5 py-4 text-xs lg:grid-cols-2">
                    <Detail label="Transformed request" value={log.transformedRequest} />
                    <Detail label="Response body" value={log.responseBody} />
                    {log.upstreamUrl && (
                      <div className="lg:col-span-2">
                        <Label>Upstream URL</Label>
                        <code className="block rounded-md bg-white px-3 py-2 font-mono text-[11px] text-slate-700">{log.upstreamUrl}</code>
                      </div>
                    )}
                    {log.errors.length > 0 && (
                      <div className="lg:col-span-2">
                        <Label>Errors</Label>
                        <ul className="space-y-1">
                          {log.errors.map((message, index) => (
                            <li key={index} className="rounded-md bg-rose-50 px-3 py-2 font-mono text-[11px] text-rose-700">{message}</li>
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
      )}
    </div>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: unknown }) {
  return (
    <div>
      <Label>{label}</Label>
      {value === null || value === undefined ? (
        <div className="rounded-md bg-white px-3 py-2 text-[11px] text-slate-400">—</div>
      ) : (
        <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-50">{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return "bg-emerald-50 text-emerald-700";
  if (code >= 300 && code < 400) return "bg-sky-50 text-sky-700";
  if (code >= 400 && code < 500) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}
