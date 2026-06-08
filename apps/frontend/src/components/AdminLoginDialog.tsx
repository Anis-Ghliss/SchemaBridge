import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { setAdminToken } from "../lib/api";

interface Props {
  readonly onAuthenticated: () => void;
}

export function AdminLoginDialog({ onAuthenticated }: Props) {
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (token.trim().length === 0) return;
    setSubmitting(true);
    setAdminToken(token.trim());
    onAuthenticated();
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
        <div className="border-b border-border px-6 py-4">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-slate-700">
            <KeyRound className="h-3 w-3" /> Admin login
          </div>
          <h2 className="text-base font-semibold">This bridge requires an admin token</h2>
          <p className="mt-1 text-xs text-slate-500">Set with the <code className="rounded bg-muted px-1 py-0.5">ADMIN_API_KEY</code> environment variable on the bridge container. Your token is stored locally in this browser.</p>
        </div>
        <form
          className="space-y-3 px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Admin token</span>
            <Input type="password" autoFocus value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste your admin token" />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || token.trim().length === 0}>Continue</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
