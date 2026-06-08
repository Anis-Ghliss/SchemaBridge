import { Activity, GitBranch, Layers3, Send, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useAppStore, type AppView } from "../store";
import { DesignView } from "../pages/DesignView";
import { DeployView } from "../pages/DeployView";
import { TryView } from "../pages/TryView";
import { cn } from "../lib/utils";

interface NavItem {
  readonly id: AppView;
  readonly label: string;
  readonly hint: string;
  readonly icon: typeof Layers3;
}

const NAV: readonly NavItem[] = [
  { id: "design", label: "Design", hint: "Schemas + mapping rules", icon: Layers3 },
  { id: "deploy", label: "Deploy", hint: "Bindings + upstreams", icon: GitBranch },
  { id: "try", label: "Try it", hint: "Send through the bridge", icon: Send }
];

export function AppShell() {
  const { view, setView, status, load, schemas, mappings, bindings } = useAppStore();

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-background">
      <aside className="flex flex-col border-r border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">SchemaBridge</div>
            <div className="text-[11px] text-slate-500">Mapping middleware</div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  "mb-1 flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left text-sm transition",
                  isActive ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-muted"
                )}
              >
                <Icon className={cn("mt-0.5 h-4 w-4", isActive ? "text-primary" : "text-slate-500")} />
                <div className="flex-1">
                  <div className="font-medium leading-tight">{item.label}</div>
                  <div className={cn("text-[11px] leading-tight", isActive ? "text-primary/70" : "text-slate-500")}>{item.hint}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border p-4 text-[11px] text-slate-500">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Counter label="Schemas" value={schemas.length} />
            <Counter label="Mappings" value={mappings.length} />
            <Counter label="Bindings" value={bindings.length} />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3.5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">{NAV.find((item) => item.id === view)?.label}</h1>
            <span className="text-xs text-slate-400">/</span>
            <span className="text-xs text-slate-500">{NAV.find((item) => item.id === view)?.hint}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
              <Activity className="h-3 w-3" />
              {status}
            </span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
          {view === "design" && <DesignView />}
          {view === "deploy" && <DeployView />}
          {view === "try" && <TryView />}
        </main>
      </div>
    </div>
  );
}

function Counter({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-md border border-border bg-white px-2 py-1.5">
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
