import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "../store";
import { Button } from "./ui/button";

export function AppDialog() {
  const { dialog, resolveDialog } = useAppStore();

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resolveDialog(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, resolveDialog]);

  if (!dialog) return null;

  const isDanger = dialog.variant === "danger";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${dialog.id}-title`}
        aria-describedby={`${dialog.id}-description`}
        className="w-full max-w-md rounded-lg border border-border bg-white shadow-xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className={isDanger ? "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-600" : "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-slate-700"}>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={`${dialog.id}-title`} className="text-sm font-semibold">{dialog.title}</h2>
            <p id={`${dialog.id}-description`} className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">{dialog.description}</p>
          </div>
          {dialog.showCancel !== false && (
            <button type="button" onClick={() => resolveDialog(false)} className="rounded-md p-1 text-slate-400 hover:bg-muted hover:text-foreground" aria-label="Close dialog">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          {dialog.showCancel !== false && (
            <Button variant="ghost" onClick={() => resolveDialog(false)}>
              {dialog.cancelLabel ?? "Cancel"}
            </Button>
          )}
          <Button variant={isDanger ? "danger" : "primary"} onClick={() => resolveDialog(true)} autoFocus>
            {dialog.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
