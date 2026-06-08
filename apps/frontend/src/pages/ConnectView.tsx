import { GitBranch, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { parseSchema } from "@schemabridge/schema-parser";
import { useAppStore } from "../store";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { SchemaTree } from "../components/SchemaTree";
import { MappingCanvas } from "../components/MappingCanvas";
import { EmptyState } from "../components/EmptyState";
import { suggestMappings } from "../lib/suggestMappings";

export function ConnectView() {
  const { sourceSchema, targetSchema, activeMapping, rules, setRules, saveMapping, saveVersion, restoreVersion, setView } = useAppStore();
  const [selected, setSelected] = useState<string>();
  const [mappingName, setMappingName] = useState(activeMapping?.name ?? "Customer v1 to v2");

  if (!sourceSchema || !targetSchema) {
    return (
      <EmptyState
        icon={GitBranch}
        title="Save your schemas first"
        description="Bring source + target shapes into the bridge before drawing connections."
        action={<Button onClick={() => setView("define")}>Go to Define</Button>}
      />
    );
  }

  const sourceFields = sourceSchema.fields ?? parseSchema(sourceSchema.content).fields;
  const targetFields = targetSchema.fields ?? parseSchema(targetSchema.content).fields;

  function suggest() {
    setRules(suggestMappings(sourceFields, targetFields));
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Mapping rules</h3>
            <p className="mt-0.5 text-xs text-slate-500">Drag a source field onto a target field. The dotted edges are the rules that will run at the proxy.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={suggest}>
              <Sparkles className="h-3.5 w-3.5" /> Suggest by name
            </Button>
            <Input
              aria-label="Mapping name"
              className="h-9 min-w-56"
              value={mappingName}
              onChange={(event) => setMappingName(event.target.value)}
              placeholder="Mapping name"
            />
            <Button size="sm" onClick={() => saveMapping(mappingName)} disabled={!sourceSchema || !targetSchema}>
              <GitBranch className="h-3.5 w-3.5" /> Save mapping
            </Button>
            <Button variant="secondary" size="sm" onClick={() => saveVersion()} disabled={!activeMapping}>
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

        <p className="mt-3 text-xs text-slate-500">{rules.length} rule{rules.length === 1 ? "" : "s"} defined.</p>
      </Card>
    </div>
  );
}
