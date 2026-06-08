import { Save, Sparkles } from "lucide-react";
import { useState } from "react";
import type { JsonValue } from "@schemabridge/shared-types";
import { useAppStore } from "../store";
import { sampleSource, sampleTarget } from "../lib/samples";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { SchemaInput } from "../components/SchemaInput";

export function DefineView() {
  const { schemas, mappings, bindings, sourceSchema, targetSchema, saveSchemaPair, loadSample } = useAppStore();
  const [sourceDraft, setSourceDraft] = useState<{ readonly name: string; readonly content: JsonValue }>(() => ({ name: "Customer API v1", content: sampleSource }));
  const [targetDraft, setTargetDraft] = useState<{ readonly name: string; readonly content: JsonValue }>(() => ({ name: "Customer API v2", content: sampleTarget }));

  const isFreshInstall = schemas.length === 0 && mappings.length === 0 && bindings.length === 0;

  return (
    <div className="space-y-5">
      {isFreshInstall && (
        <Card className="overflow-hidden border-primary/30 bg-gradient-to-r from-primary/8 via-white to-amber-50">
          <div className="flex flex-col items-start gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" /> First-run
              </div>
              <h2 className="text-base font-semibold">Two services, two shapes, one bridge.</h2>
              <p className="mt-0.5 max-w-xl text-xs text-slate-600">
                Paste what <strong>Service A</strong> sends today on the left and what <strong>Service B</strong> now expects on the right. The bridge will translate between them at runtime.
              </p>
            </div>
            <Button onClick={() => void loadSample()}><Sparkles className="h-4 w-4" /> Load sample</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Source schema</h3>
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
            <h3 className="text-sm font-semibold">Target schema</h3>
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
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveSchemaPair(sourceDraft, targetDraft)}>
          <Save className="h-4 w-4" /> Save schemas
        </Button>
      </div>
    </div>
  );
}
