import { Copy, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { PROXY_URL, probeProxy, type ProxyProbeResult } from "../../lib/api";
import { useAppStore } from "../../store";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { JsonEditor } from "../../components/JsonEditor";

const DEFAULT_PAYLOAD = JSON.stringify({ customerName: "Ada", customerEmail: "ada@example.com" }, null, 2);

export function TryPanel() {
  const { bindings } = useAppStore();
  const [selectedId, setSelectedId] = useState<string>(bindings[0]?.id ?? "");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [result, setResult] = useState<ProxyProbeResult | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = useMemo(() => bindings.find((binding) => binding.id === selectedId) ?? bindings[0], [bindings, selectedId]);

  const curlCommand = useMemo(() => {
    if (!selected) return "";
    const method = selected.method === "*" ? "POST" : selected.method;
    const path = selected.pathPattern.replace(/:([A-Za-z0-9_]+)/g, "demo");
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
    const lines = [`curl -X ${method} ${PROXY_URL}${path}`, `  -H 'content-type: application/json'`];
    if (hasBody) lines.push(`  -d '${payload.replace(/\n\s*/g, " ")}'`);
    return lines.join(" \\\n");
  }, [selected, payload]);

  async function run() {
    if (!selected) return;
    setRunning(true);
    setError(undefined);
    try {
      const body = JSON.parse(payload) as unknown;
      const probe = await probeProxy(selected, body);
      setResult(probe);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function copyCurl() {
    await navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Request</h3>
          <p className="text-xs text-slate-500">Sent through the proxy port at <code className="rounded bg-muted px-1 py-0.5">{PROXY_URL}</code>.</p>
        </div>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Binding</span>
            <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>{binding.method} {binding.pathPattern} → {binding.upstreamBaseUrl}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="font-medium text-slate-600">Payload (JSON)</span>
            <JsonEditor value={payload} onChange={setPayload} label="Request body" minHeight="180px" maxHeight="280px" />
          </div>
          <Button onClick={() => void run()} disabled={!selected || running}>
            <Send className="h-4 w-4" /> {running ? "Sending…" : "Send through proxy"}
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Equivalent curl</span>
            <Button variant="ghost" size="sm" onClick={() => void copyCurl()}><Copy className="h-3 w-3" /> {copied ? "Copied" : "Copy"}</Button>
          </div>
          <pre className="overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{curlCommand}</pre>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Response</h3>
          {result && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${result.status >= 200 && result.status < 300 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              HTTP {result.status}
            </span>
          )}
        </div>
        {result ? (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(result.body, null, 2)}</pre>
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer select-none">Response headers</summary>
              <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-3 text-[11px]">{JSON.stringify(result.headers, null, 2)}</pre>
            </details>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Send a request to see the upstream response.</div>
        )}
      </Card>
    </div>
  );
}
