import { Activity, Check, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DriftEvent, DriftKind, DriftStage } from "@schemabridge/shared-types";
import { acknowledgeDriftEvent, clearDriftEvents, listDriftEvents } from "../lib/api";
import { useAppStore } from "../store";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { EmptyState } from "../components/EmptyState";
import { cn } from "../lib/utils";

const POLL_INTERVAL_MS = 5000;
const MAX_ROWS = 500;

const STAGE_LABEL: Record<DriftStage, string> = {
  "request-source": "Request in",
  "request-target": "Request out",
  "response-source": "Response in",
  "response-target": "Response out"
};

const KIND_LABEL: Record<DriftKind, string> = {
  added: "Added field",
  missing: "Missing field",
  "type-changed": "Type changed"
};

const KIND_COLOR: Record<DriftKind, string> = {
  added: "bg-amber-50 text-amber-700",
  missing: "bg-rose-50 text-rose-700",
  "type-changed": "bg-violet-50 text-violet-700"
};

type KindFilter = "all" | DriftKind;

export function DriftPage() {
  const { bindings, setView, selectBinding } = useAppStore();
  const [events, setEvents] = useState<readonly DriftEvent[]>([]);
  const [bindingFilter, setBindingFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [error, setError] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await listDriftEvents({ limit: MAX_ROWS });
      setEvents(next);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load drift");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const bindingNameById = useMemo(() => new Map(bindings.map((binding) => [binding.id, binding.name])), [bindings]);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (bindingFilter && event.bindingId !== bindingFilter) return false;
      if (kindFilter !== "all" && event.kind !== kindFilter) return false;
      return true;
    });
  }, [events, bindingFilter, kindFilter]);

  const acknowledge = useCallback(async (id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
    try {
      await acknowledgeDriftEvent(id);
    } catch {
      void refresh();
    }
  }, [refresh]);

  const clearAll = useCallback(async () => {
    const scope = bindingFilter || undefined;
    try {
      await clearDriftEvents(scope ? { bindingId: scope } : {});
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to clear drift");
    }
  }, [bindingFilter, refresh]);

  if (loaded && events.length === 0 && !error) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No contract drift detected"
        description="As traffic flows through your bindings, SchemaBridge compares each payload against its declared schemas. When an upstream adds a field, drops one, or changes a type, it shows up here."
        action={<Button variant="secondary" onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
            <Activity className="h-3 w-3" />
            {filtered.length} drift {filtered.length === 1 ? "signal" : "signals"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-md border border-border bg-white px-2 text-xs" value={bindingFilter} onChange={(event) => setBindingFilter(event.target.value)}>
            <option value="">All bindings</option>
            {bindings.map((binding) => <option key={binding.id} value={binding.id}>{binding.name}</option>)}
          </select>
          <select className="h-8 rounded-md border border-border bg-white px-2 text-xs" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)}>
            <option value="all">All kinds</option>
            <option value="added">Added field</option>
            <option value="missing">Missing field</option>
            <option value="type-changed">Type changed</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
          {events.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => void clearAll()}><Trash2 className="h-3.5 w-3.5" /> Clear{bindingFilter ? " (binding)" : " all"}</Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">No drift matches the current filter.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_110px_120px_1.4fr_140px_70px_120px_44px] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Binding</span>
            <span>Stage</span>
            <span>Kind</span>
            <span>Path</span>
            <span>Type</span>
            <span>Count</span>
            <span>Last seen</span>
            <span className="text-right">Ack</span>
          </div>
          {filtered.map((event) => (
            <div key={event.id} className="grid grid-cols-[1fr_110px_120px_1.4fr_140px_70px_120px_44px] items-center gap-3 border-b border-border px-5 py-3 text-left text-sm last:border-b-0 hover:bg-muted/30">
              <button
                type="button"
                className="truncate text-left text-xs text-slate-600 underline-offset-2 hover:underline"
                onClick={() => void setView("bindings").then((changed) => { if (changed) selectBinding(event.bindingId); })}
              >
                {bindingNameById.get(event.bindingId) ?? event.bindingId}
              </button>
              <span className="text-xs text-slate-500">{STAGE_LABEL[event.stage]}</span>
              <span className={cn("inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_COLOR[event.kind])}>{KIND_LABEL[event.kind]}</span>
              <code className="truncate font-mono text-xs text-slate-700">{event.path}</code>
              <span className="font-mono text-[11px] text-slate-500">{formatTypes(event)}</span>
              <span className="text-xs text-slate-500">{event.count}</span>
              <span className="text-xs text-slate-500">{formatTime(event.lastSeenAt)}</span>
              <button
                type="button"
                title="Acknowledge"
                className="ml-auto grid h-7 w-7 place-items-center rounded-md border border-border text-slate-500 hover:bg-muted hover:text-emerald-600"
                onClick={() => void acknowledge(event.id)}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function formatTypes(event: DriftEvent): string {
  if (event.kind === "type-changed") return `${event.expectedType ?? "?"} → ${event.observedType ?? "?"}`;
  if (event.kind === "added") return event.observedType ?? "—";
  return event.expectedType ?? "—";
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
