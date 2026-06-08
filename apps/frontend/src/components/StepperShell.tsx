import { Activity, ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { APP_STEPS, useAppStore } from "../store";
import { DefineView } from "../pages/DefineView";
import { ConnectView } from "../pages/ConnectView";
import { DeployView } from "../pages/DeployView";
import { ObserveView } from "../pages/ObserveView";
import { cn } from "../lib/utils";

export function StepperShell() {
  const { view, setView, status, load } = useAppStore();

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  const currentIndex = APP_STEPS.findIndex((step) => step.id === view);
  const prev = APP_STEPS[currentIndex - 1];
  const next = APP_STEPS[currentIndex + 1];

  const stepNode = useMemo(() => {
    switch (view) {
      case "define": return <DefineView />;
      case "connect": return <ConnectView />;
      case "deploy": return <DeployView />;
      case "observe": return <ObserveView />;
    }
  }, [view]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold leading-tight">SchemaBridge</div>
          </div>

          <Stepper currentIndex={currentIndex} onJump={(id) => setView(id)} />

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
            <Activity className="h-3 w-3" />
            {status}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-5">
          <h1 className="text-xl font-semibold">{APP_STEPS[currentIndex]?.label}</h1>
          <p className="text-sm text-slate-500">{APP_STEPS[currentIndex]?.hint}</p>
        </div>

        {stepNode}

        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <button
            type="button"
            onClick={() => prev && setView(prev.id)}
            disabled={!prev}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {prev ? `Back to ${prev.label}` : "Back"}
          </button>
          <span className="text-xs text-slate-500">Step {currentIndex + 1} of {APP_STEPS.length}</span>
          <button
            type="button"
            onClick={() => next && setView(next.id)}
            disabled={!next}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {next ? `Continue to ${next.label}` : "Done"} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </main>
    </div>
  );
}

function Stepper({ currentIndex, onJump }: { readonly currentIndex: number; readonly onJump: (view: typeof APP_STEPS[number]["id"]) => void }) {
  return (
    <nav aria-label="Setup progress" className="flex items-center gap-1.5">
      {APP_STEPS.map((step, index) => {
        const isDone = index < currentIndex;
        const isActive = index === currentIndex;
        return (
          <div key={step.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onJump(step.id)}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold",
                  isDone ? "bg-primary text-white" : isActive ? "bg-primary/15 text-primary" : "bg-muted text-slate-400"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className={cn("hidden text-sm sm:inline", isActive ? "font-medium text-foreground" : isDone ? "text-slate-700" : "text-slate-500")}>{step.label}</span>
            </button>
            {index < APP_STEPS.length - 1 && (
              <div className={cn("h-px w-6 sm:w-8", isDone ? "bg-primary/40" : "bg-border")} />
            )}
          </div>
        );
      })}
    </nav>
  );
}
