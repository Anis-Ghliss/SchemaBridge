import type { JsonValue } from "@schemabridge/shared-types";
import { parseJsonText } from "@schemabridge/schema-parser";
import { Upload } from "lucide-react";
import { useState } from "react";
import { Input } from "./ui/input";
import { JsonEditor } from "./JsonEditor";

interface Props {
  readonly label: string;
  readonly initialName?: string;
  readonly initialContent?: JsonValue;
  readonly onValidJson: (value: { readonly name: string; readonly content: JsonValue }) => void;
}

export function SchemaInput({ label, initialName, initialContent, onValidJson }: Props) {
  const [name, setName] = useState(initialName ?? "");
  const [text, setText] = useState(() => (initialContent !== undefined ? JSON.stringify(initialContent, null, 2) : "{}"));

  function applyText(nextText: string, nextName = name.trim() || label) {
    setText(nextText);
    setName(nextName);
    const parsed = parseJsonText(nextText);
    if (parsed.error || parsed.value === undefined) return;
    onValidJson({ name: nextName, content: parsed.value });
  }

  async function readFile(file: File) {
    applyText(await file.text(), file.name.replace(/\.json$/i, ""));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input value={name} placeholder={label} onChange={(event) => setName(event.target.value)} aria-label={`${label} schema name`} />
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-medium hover:bg-muted">
          <Upload className="h-4 w-4" /> Upload
          <input className="hidden" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
        </label>
      </div>
      <JsonEditor value={text} onChange={(next) => applyText(next)} label={label} ariaLabel={`${label} JSON`} />
    </div>
  );
}
