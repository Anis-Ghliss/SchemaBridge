import { ArrowLeft, ArrowRight, Check, GitBranch, Layers3, Send, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreateProxyBindingRequest, JsonValue, MappingRule, ProxyBindingMethod, SchemaDocument } from "@schemabridge/shared-types";
import { parseJsonText, parseSchema } from "@schemabridge/schema-parser";
import { createBinding, createMapping, createSchema } from "../lib/api";
import { sampleSource, sampleTarget } from "../lib/samples";
import { suggestMappings } from "../lib/suggestMappings";
import { useAppStore } from "../store";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { JsonEditor } from "./JsonEditor";
import { cn } from "../lib/utils";

const STEPS = [
  { id: 1, label: "Welcome" },
  { id: 2, label: "Old shape" },
  { id: 3, label: "New shape" },
  { id: 4, label: "Connect" },
  { id: 5, label: "Deploy" }
] as const;

const METHODS: readonly ProxyBindingMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

interface DraftSchema {
  readonly name: string;
  readonly text: string;
  readonly content?: JsonValue;
  readonly error?: string;
}

function emptyDraft(name: string, sample: JsonValue): DraftSchema {
  const text = JSON.stringify(sample, null, 2);
  return { name, text, content: sample };
}

export function QuickStartModal() {
  const { closeQuickStart, setView, selectBinding, load } = useAppStore();
  const [step, setStep] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const [oldShape, setOldShape] = useState<DraftSchema>(() => emptyDraft("Service A — current payload", sampleSource));
  const [newShape, setNewShape] = useState<DraftSchema>(() => emptyDraft("Service B — expected payload", sampleTarget));
  const [savedSource, setSavedSource] = useState<SchemaDocument>();
  const [savedTarget, setSavedTarget] = useState<SchemaDocument>();
  const [rules, setRules] = useState<readonly MappingRule[]>([]);
  const [mappingId, setMappingId] = useState<string | undefined>();
  const [bindingDraft, setBindingDraft] = useState<{ readonly name: string; readonly method: ProxyBindingMethod; readonly pathPattern: string; readonly upstreamBaseUrl: string }>({
    name: "Service B — POST /endpoint",
    method: "POST",
    pathPattern: "/endpoint",
    upstreamBaseUrl: "http://service-b:8082"
  });

  const sourceFields = useMemo(() => (oldShape.content !== undefined ? parseSchema(oldShape.content).fields : []), [oldShape.content]);
  const targetFields = useMemo(() => (newShape.content !== undefined ? parseSchema(newShape.content).fields : []), [newShape.content]);

  async function advance() {
    setError(undefined);
    try {
      setBusy(true);
      if (step === 2) {
        if (!oldShape.content || oldShape.name.trim().length === 0) throw new Error("Add a name and valid JSON for the old payload.");
        const saved = await createSchema({ name: oldShape.name, content: oldShape.content });
        setSavedSource(saved);
        setStep(3);
      } else if (step === 3) {
        if (!newShape.content || newShape.name.trim().length === 0) throw new Error("Add a name and valid JSON for the new payload.");
        const saved = await createSchema({ name: newShape.name, content: newShape.content });
        setSavedTarget(saved);
        const suggested = suggestMappings(sourceFields, targetFields);
        setRules(suggested);
        setStep(4);
      } else if (step === 4) {
        if (!savedSource || !savedTarget) throw new Error("Schemas missing — go back to the previous steps.");
        if (rules.length === 0) throw new Error("Add at least one mapping rule before continuing.");
        const mapping = await createMapping({ name: `${savedSource.name} → ${savedTarget.name}`, sourceSchemaId: savedSource.id, targetSchemaId: savedTarget.id, rules: [...rules] });
        setMappingId(mapping.id);
        setStep(5);
      } else if (step === 5) {
        if (!mappingId) throw new Error("Mapping missing — go back to step 4.");
        const payload: CreateProxyBindingRequest = {
          name: bindingDraft.name,
          method: bindingDraft.method,
          pathPattern: bindingDraft.pathPattern,
          upstreamBaseUrl: bindingDraft.upstreamBaseUrl,
          mappingId
        };
        const created = await createBinding(payload);
        await load();
        setView("bindings");
        selectBinding(created.id);
        closeQuickStart();
      } else {
        setStep(step + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-white shadow-2xl">
        <button
          type="button"
          onClick={closeQuickStart}
          aria-label="Close quick start"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-muted hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>

        <Stepper current={step} />

        <div className="flex-1 overflow-auto px-8 pb-4">
          {step === 1 && <Welcome onSkip={closeQuickStart} />}
          {step === 2 && <SchemaStep heading="The old payload — what Service A still sends" body="Paste a representative request body. This is what your existing callers produce today." draft={oldShape} setDraft={setOldShape} sample={sampleSource} role="source" />}
          {step === 3 && <SchemaStep heading="The new payload — what Service B now expects" body="Paste the new shape Service B requires. SchemaBridge will translate from old → new for you." draft={newShape} setDraft={setNewShape} sample={sampleTarget} role="target" />}
          {step === 4 && <ConnectStep sourceFields={sourceFields} targetFields={targetFields} rules={rules} onChange={setRules} />}
          {step === 5 && <DeployStep draft={bindingDraft} setDraft={setBindingDraft} />}
          {error && <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-8 py-4">
          <div className="text-xs text-slate-500">Step {step} of {STEPS.length}</div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={busy}>
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            )}
            {step === 1 && (
              <Button variant="ghost" size="sm" onClick={closeQuickStart}>I'll explore on my own</Button>
            )}
            <Button onClick={() => void advance()} disabled={busy}>
              {step === STEPS.length ? <>Deploy binding <Check className="h-4 w-4" /></> : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stepper({ current }: { readonly current: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-8 py-5">
      {STEPS.map((step) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <div key={step.id} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold",
                done ? "bg-primary text-primary-foreground" : active ? "bg-foreground/10 text-foreground" : "bg-muted text-slate-400"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : step.id}
            </div>
            <span className={cn("text-xs", active ? "font-medium text-foreground" : "text-slate-500")}>{step.label}</span>
            {step.id < STEPS.length && <div className={cn("h-px flex-1", done ? "bg-foreground/30" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function Welcome({ onSkip }: { readonly onSkip: () => void }) {
  return (
    <div className="space-y-5 py-6">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-slate-700">
        <Sparkles className="h-3 w-3" /> Quick start
      </div>
      <h2 className="text-xl font-semibold">Two services, two shapes, one bridge.</h2>
      <p className="text-sm text-slate-600">
        Picture this: <strong>Service A</strong> sends requests in its current shape and <strong>Service B</strong> just changed what it expects. Point Service A at SchemaBridge — and the bridge translates each request before forwarding it to Service B.
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        <Tile icon={Layers3} title="1. Capture both shapes" body="Paste the old and new payloads — that's how the bridge learns what to translate." />
        <Tile icon={GitBranch} title="2. Connect the fields" body="Drag (or accept the suggestions) so each field in the old shape maps to its place in the new shape." />
        <Tile icon={Send} title="3. Send traffic through" body="Point Service A at the bridge port. We'll reshape every request and forward it for you." />
      </div>

      <p className="text-xs text-slate-500">
        This takes about a minute. <button type="button" className="underline hover:text-foreground" onClick={onSkip}>Skip and explore on your own</button>.
      </p>
    </div>
  );
}

function Tile({ icon: Icon, title, body }: { readonly icon: typeof Layers3; readonly title: string; readonly body: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <Icon className="mb-2 h-4 w-4 text-foreground" />
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <p className="text-xs text-slate-600">{body}</p>
    </div>
  );
}

interface SchemaStepProps {
  readonly heading: string;
  readonly body: string;
  readonly draft: DraftSchema;
  readonly setDraft: (draft: DraftSchema) => void;
  readonly sample: JsonValue;
  readonly role: "source" | "target";
}

function SchemaStep({ heading, body, draft, setDraft, sample, role }: SchemaStepProps) {
  function update(nextName: string, nextText: string) {
    const parsed = parseJsonText(nextText);
    setDraft({ name: nextName, text: nextText, content: parsed.value, error: parsed.error });
  }

  function loadSample() {
    const text = JSON.stringify(sample, null, 2);
    setDraft({ name: draft.name, text, content: sample });
  }

  return (
    <div className="space-y-4 py-6">
      <div>
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="mt-1 text-sm text-slate-500">{body}</p>
      </div>
      <label className="flex flex-col gap-1.5 text-xs">
        <span className="font-medium text-slate-600">Name</span>
        <Input value={draft.name} onChange={(event) => update(event.target.value, draft.text)} placeholder={role === "source" ? "Service A — current payload" : "Service B — expected payload"} />
      </label>
      <div className="flex flex-col gap-1.5 text-xs">
        <span className="flex items-center justify-between font-medium text-slate-600">
          Example payload (JSON)
          <button type="button" className="text-[11px] font-medium text-foreground hover:underline" onClick={loadSample}>Use sample payload</button>
        </span>
        <JsonEditor value={draft.text} onChange={(next) => update(draft.name, next)} label={role === "source" ? "Old shape" : "New shape"} minHeight="240px" maxHeight="320px" />
      </div>
    </div>
  );
}

interface ConnectStepProps {
  readonly sourceFields: ReturnType<typeof parseSchema>["fields"];
  readonly targetFields: ReturnType<typeof parseSchema>["fields"];
  readonly rules: readonly MappingRule[];
  readonly onChange: (rules: readonly MappingRule[]) => void;
}

function ConnectStep({ sourceFields, targetFields, rules, onChange }: ConnectStepProps) {
  const sourceLeaves = useMemo(() => leaves(sourceFields), [sourceFields]);
  const targetLeaves = useMemo(() => leaves(targetFields), [targetFields]);

  function setRuleFor(targetPath: string, sourcePath: string) {
    const next = rules.filter((rule) => rule.targetPath !== targetPath);
    if (sourcePath) next.push({ id: crypto.randomUUID(), sourcePath, targetPath });
    onChange(next);
  }

  return (
    <div className="space-y-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Connect the fields</h2>
          <p className="mt-1 text-sm text-slate-500">Each row picks where a target field comes from. We've suggested matches by name — adjust as needed.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear</Button>
          <Button variant="secondary" size="sm" onClick={() => onChange(suggestMappings(sourceFields, targetFields))}><Sparkles className="h-3.5 w-3.5" /> Re-suggest</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-[1fr_24px_1fr] gap-3 border-b border-border bg-muted/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Source field (old shape)</span>
          <span></span>
          <span>Target field (new shape)</span>
        </div>
        {targetLeaves.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">The target schema has no leaf fields — go back and adjust.</p>
        ) : (
          targetLeaves.map((target) => {
            const rule = rules.find((item) => item.targetPath === target.path);
            return (
              <div key={target.path} className="grid grid-cols-[1fr_24px_1fr] items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                <select
                  className="h-9 rounded-md border border-border bg-white px-2 text-xs"
                  value={rule?.sourcePath ?? ""}
                  onChange={(event) => setRuleFor(target.path, event.target.value)}
                >
                  <option value="">— no source —</option>
                  {sourceLeaves.map((source) => (
                    <option key={source.path} value={source.path}>{source.path}</option>
                  ))}
                </select>
                <span className="text-center text-slate-400">→</span>
                <span className="truncate font-mono text-xs">{target.path}</span>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-slate-500">{rules.length} of {targetLeaves.length} target fields mapped.</p>
    </div>
  );
}

interface DeployStepProps {
  readonly draft: { readonly name: string; readonly method: ProxyBindingMethod; readonly pathPattern: string; readonly upstreamBaseUrl: string };
  readonly setDraft: (draft: { readonly name: string; readonly method: ProxyBindingMethod; readonly pathPattern: string; readonly upstreamBaseUrl: string }) => void;
}

function DeployStep({ draft, setDraft }: DeployStepProps) {
  return (
    <div className="space-y-4 py-6">
      <div>
        <h2 className="text-lg font-semibold">Where should the bridge listen?</h2>
        <p className="mt-1 text-sm text-slate-500">Pick the route Service A will hit and tell the bridge where to forward the transformed request.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Binding name"><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
        <Field label="Method">
          <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value as ProxyBindingMethod })}>
            {METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </Field>
        <Field label="Path pattern"><Input value={draft.pathPattern} placeholder="/customers/:id" onChange={(event) => setDraft({ ...draft, pathPattern: event.target.value })} /></Field>
        <Field label="Service B URL"><Input value={draft.upstreamBaseUrl} placeholder="http://service-b:8082" onChange={(event) => setDraft({ ...draft, upstreamBaseUrl: event.target.value })} /></Field>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-slate-600">
        <strong>Next:</strong> after this step we land you on the new binding so you can hit "Try it" and verify the round-trip.
      </div>
    </div>
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

function leaves(fields: ReturnType<typeof parseSchema>["fields"]): readonly { readonly path: string }[] {
  const acc: { path: string }[] = [];
  function walk(items: ReturnType<typeof parseSchema>["fields"]) {
    for (const item of items) {
      if (item.children.length === 0) acc.push({ path: item.path });
      else walk(item.children);
    }
  }
  walk(fields);
  return acc;
}
