import { GitBranch, Play, RotateCcw, Save } from "lucide-react";
import { useMemo, useState } from "react";
import type { JsonValue } from "@schemabridge/shared-types";
import { parseJsonText, parseSchema } from "@schemabridge/schema-parser";
import { useAppStore } from "../store";
import { sampleSource, sampleTarget } from "../lib/samples";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { JsonEditor } from "../components/JsonEditor";
import { SchemaInput } from "../components/SchemaInput";
import { SchemaTree } from "../components/SchemaTree";
import { MappingCanvas } from "../components/MappingCanvas";

export function DesignView() {
  const { sourceSchema, targetSchema, activeMapping, rules, output, setRules, saveSchemaPair, saveMapping, saveVersion, restoreVersion, runTransform } = useAppStore();
  const [sourceDraft, setSourceDraft] = useState<{ readonly name: string; readonly content: JsonValue }>(() => ({ name: "Customer API v1", content: sampleSource }));
  const [targetDraft, setTargetDraft] = useState<{ readonly name: string; readonly content: JsonValue }>(() => ({ name: "Customer API v2", content: sampleTarget }));
  const [payload, setPayload] = useState(() => JSON.stringify(sampleSource, null, 2));
  const [selected, setSelected] = useState<string>();
  const [mappingName, setMappingName] = useState("Customer v1 to v2");

  const sourceFields = sourceSchema?.fields ?? parseSchema(sourceDraft.content).fields;
  const targetFields = targetSchema?.fields ?? parseSchema(targetDraft.content).fields;
  const mappingJson = useMemo(() => Object.fromEntries(rules.map((rule) => [rule.sourcePath, rule.targetPath])), [rules]);

  async function execute() {
    const parsed = parseJsonText(payload);
    if (parsed.value !== undefined) await runTransform(parsed.value);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Source schema</h2>
            {sourceSchema && <span className="text-[11px] text-slate-500">Saved · {sourceSchema.name}</span>}
          </div>
          <SchemaInput
            key={sourceSchema?.id ?? "source-draft"}
            label="Source schema"
            sample="source"
            initialName={sourceSchema?.name}
            initialContent={sourceSchema?.content}
            onValidJson={setSourceDraft}
          />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Target schema</h2>
            {targetSchema && <span className="text-[11px] text-slate-500">Saved · {targetSchema.name}</span>}
          </div>
          <SchemaInput
            key={targetSchema?.id ?? "target-draft"}
            label="Target schema"
            sample="target"
            initialName={targetSchema?.name}
            initialContent={targetSchema?.content}
            onValidJson={setTargetDraft}
          />
        </Card>
      </section>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Mapping canvas</h2>
            <p className="text-xs text-slate-500">Drag a source field onto a target field to create a rule.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => saveSchemaPair(sourceDraft, targetDraft)}>
              <Save className="h-4 w-4" /> Save schemas
            </Button>
            <input
              aria-label="Mapping name"
              className="h-10 min-w-56 rounded-md border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
              value={mappingName}
              onChange={(event) => setMappingName(event.target.value)}
              placeholder="Mapping name"
            />
            <Button onClick={() => saveMapping(mappingName)} disabled={!sourceSchema || !targetSchema}>
              <GitBranch className="h-4 w-4" /> Save mapping
            </Button>
            <Button variant="secondary" onClick={() => saveVersion()} disabled={!activeMapping}>
              New version
            </Button>
          </div>
        </div>

        {activeMapping && activeMapping.versions.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Versions</span>
            {activeMapping.versions.map((version) => (
              <Button
                key={version.version}
                variant={version.version === activeMapping.currentVersion ? "primary" : "ghost"}
                size="sm"
                onClick={() => restoreVersion(version.version)}
              >
                <RotateCcw className="h-3 w-3" /> v{version.version}
              </Button>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[240px_1fr_240px]">
          <div className="rounded-md border border-border bg-white p-3">
            <SchemaTree title="Source" fields={sourceFields} selected={selected} onSelect={setSelected} />
          </div>
          <MappingCanvas sourceFields={sourceFields} targetFields={targetFields} rules={rules} onRulesChange={setRules} />
          <div className="rounded-md border border-border bg-white p-3">
            <SchemaTree title="Target" fields={targetFields} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Preview payload</h2>
            <Button onClick={() => void execute()} disabled={rules.length === 0}>
              <Play className="h-4 w-4" /> Run transform
            </Button>
          </div>
          <JsonEditor value={payload} onChange={setPayload} label="Sample input" minHeight="220px" maxHeight="320px" />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Transformed output</h2>
            <span className="text-[11px] text-slate-500">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
          </div>
          <pre className="max-h-72 min-h-32 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(output ?? mappingJson, null, 2)}</pre>
        </Card>
      </section>
    </div>
  );
}
