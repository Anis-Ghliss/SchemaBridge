import { Copy, KeyRound, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store";
import { Button } from "./ui/button";

export function RevealKeyDialog() {
  const { revealedKey, clearRevealedKey } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [savedForTry, setSavedForTry] = useState(false);

  if (!revealedKey) return null;

  async function copy() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey.key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function useInTryPanel() {
    if (!revealedKey) return;
    window.localStorage.setItem("schemabridge:try-api-key", revealedKey.key);
    setSavedForTry(true);
    window.setTimeout(() => setSavedForTry(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
        <button type="button" onClick={clearRevealedKey} aria-label="Close" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-muted hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-border px-6 py-4">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <ShieldAlert className="h-3 w-3" /> Save this now
          </div>
          <h2 className="text-base font-semibold">API key for {revealedKey.name}</h2>
          <p className="mt-1 text-xs text-slate-500">This is the only time the key will be shown. Store it somewhere safe — you can always rotate if it's lost.</p>
        </div>
        <div className="px-6 py-5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <KeyRound className="h-3 w-3" /> Bearer token
          </div>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">{revealedKey.key}</code>
            <Button onClick={() => void copy()}><Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}</Button>
          </div>
          <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{`curl -H 'Authorization: Bearer ${revealedKey.key}' \\\n  http://localhost:8080/<your-route>`}</pre>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
          <Button variant="secondary" onClick={useInTryPanel}>{savedForTry ? "Ready for Try panel" : "Use in Try panel"}</Button>
          <Button onClick={clearRevealedKey}>I've saved it</Button>
        </div>
      </div>
    </div>
  );
}
