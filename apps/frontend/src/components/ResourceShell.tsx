import { Activity, Layers3, GitBranch, Plug, Radio, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore, type ResourceView } from "../store";
import { SchemasPage } from "../pages/SchemasPage";
import { MappingsPage } from "../pages/MappingsPage";
import { BindingsPage } from "../pages/BindingsPage";
import { AppsPage } from "../pages/AppsPage";
import { LivePage } from "../pages/LivePage";
import { QuickStartModal } from "./QuickStartModal";
import { RevealKeyDialog } from "./RevealKeyDialog";
import { AdminLoginDialog } from "./AdminLoginDialog";
import { onAdminUnauthorized } from "../lib/api";
import { cn } from "../lib/utils";

interface NavItem {
  readonly id: ResourceView;
  readonly label: string;
  readonly icon: typeof Layers3;
}

const NAV: readonly NavItem[] = [
  { id: "bindings", label: "Bindings", icon: Plug },
  { id: "mappings", label: "Mappings", icon: GitBranch },
  { id: "schemas", label: "Schemas", icon: Layers3 },
  { id: "apps", label: "Apps", icon: ShieldCheck },
  { id: "live", label: "Live", icon: Radio }
];

export function ResourceShell() {
  const { view, setView, status, load, schemas, mappings, bindings, apps, quickStartOpen, openQuickStart, revealedKey } = useAppStore();
  const [loginRequired, setLoginRequired] = useState(false);

  useEffect(() => {
    onAdminUnauthorized(() => setLoginRequired(true));
    void load().catch(() => undefined);
  }, [load]);

  const counts: Record<ResourceView, number> = {
    schemas: schemas.length,
    mappings: mappings.length,
    bindings: bindings.length,
    apps: apps.length,
    live: 0
  };

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
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
            const count = counts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={cn(
                  "mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition",
                  isActive ? "bg-foreground text-primary-foreground" : "text-slate-700 hover:bg-muted"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-slate-500")} />
                <span className="flex-1 font-medium">{item.label}</span>
                {item.id !== "live" && (
                  <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold", isActive ? "bg-white/20 text-primary-foreground" : "bg-muted text-slate-500")}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={openQuickStart}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-muted"
          >
            <PlayCircle className="h-3.5 w-3.5" /> Quick start
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3.5">
          <h1 className="text-base font-semibold capitalize">{view}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-slate-700">
            <Activity className="h-3 w-3" />
            {status}
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
          {view === "schemas" && <SchemasPage />}
          {view === "mappings" && <MappingsPage />}
          {view === "bindings" && <BindingsPage />}
          {view === "apps" && <AppsPage />}
          {view === "live" && <LivePage />}
        </main>
      </div>

      {quickStartOpen && <QuickStartModal />}
      {revealedKey && <RevealKeyDialog />}
      {loginRequired && <AdminLoginDialog onAuthenticated={() => { setLoginRequired(false); void load(); }} />}
    </div>
  );
}
